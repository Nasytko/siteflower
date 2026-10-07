import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogCategoryTreeNodeDto, NavigationMenuItemPublicDto } from '@bouquet-one/contracts';
import { navItemsFromCategoryTree, navItemsFromNavigationMenu } from './storefront-nav';

const tree: CatalogCategoryTreeNodeDto[] = [
  {
    id: '1',
    parentId: null,
    slug: 'tsvety',
    name: 'Цветы',
    listingKind: 'FLOWERS',
    sortOrder: 10,
    visibility: 'VISIBLE',
    seoTitle: null,
    seoDescription: null,
    noIndex: false,
    children: [
      {
        id: '11',
        parentId: '1',
        slug: 'rozy',
        name: 'Розы',
        listingKind: 'FLOWERS',
        sortOrder: 10,
        visibility: 'VISIBLE',
        seoTitle: null,
        seoDescription: null,
        noIndex: false,
        children: [],
      },
    ],
  },
];

test('nav from category tree is category-only fallback (no static tail)', () => {
  const items = navItemsFromCategoryTree(tree);
  const ids = items.map((item) => item.id);
  assert.ok(ids.includes('tsvety'));
  assert.equal(ids.includes('povod'), false);
  assert.equal(items.find((item) => item.id === 'tsvety')?.href, '/katalog/tsvety');
  assert.equal(items.find((item) => item.id === 'tsvety')?.children?.[0]?.href, '/katalog/rozy');
});

test('nav from NavigationMenu keeps Акции without CatalogCategory', () => {
  const menu: NavigationMenuItemPublicDto[] = [
    {
      id: '1',
      label: 'Розы',
      href: '/katalog/rozy',
      accent: false,
      openInNewTab: false,
      iconKey: null,
      targetType: 'CATEGORY',
      children: [],
    },
    {
      id: '2',
      label: 'Акции',
      href: '/akcii',
      accent: true,
      openInNewTab: false,
      iconKey: null,
      targetType: 'PROMOTIONS',
      children: [],
    },
  ];
  const items = navItemsFromNavigationMenu(menu);
  assert.equal(items.length, 2);
  assert.equal(items[1]?.href, '/akcii');
  assert.equal(items[1]?.accent, true);
});

test('nav maps GROUP columns under a root item', () => {
  const menu: NavigationMenuItemPublicDto[] = [
    {
      id: 'root',
      label: 'Букеты',
      href: '/bukety',
      accent: false,
      openInNewTab: false,
      iconKey: null,
      targetType: 'PAGE',
      children: [
        {
          id: 'g1',
          label: 'По стилю',
          href: '',
          accent: false,
          openInNewTab: false,
          iconKey: 'leaf',
          targetType: 'GROUP',
          children: [
            {
              id: 'c1',
              label: 'Классика',
              href: '/bukety?line=klassika',
              accent: false,
              openInNewTab: false,
              iconKey: null,
              targetType: 'CUSTOM_URL',
              children: [],
            },
          ],
        },
        {
          id: 'direct',
          label: 'Все букеты',
          href: '/bukety',
          accent: false,
          openInNewTab: false,
          iconKey: null,
          targetType: 'PAGE',
          children: [],
        },
      ],
    },
  ];
  const items = navItemsFromNavigationMenu(menu);
  assert.equal(items[0]?.groups?.length, 1);
  assert.equal(items[0]?.groups?.[0]?.label, 'По стилю');
  assert.equal(items[0]?.groups?.[0]?.iconKey, 'leaf');
  assert.equal(items[0]?.groups?.[0]?.children[0]?.href, '/bukety?line=klassika');
  assert.equal(items[0]?.children, undefined);
});

test('nav hides HIDDEN children and keeps legacy bukety href', () => {
  const withBukety: CatalogCategoryTreeNodeDto[] = [
    {
      id: '2',
      parentId: null,
      slug: 'bukety',
      name: 'Букеты',
      listingKind: 'BOUQUETS',
      sortOrder: 20,
      visibility: 'VISIBLE',
      seoTitle: null,
      seoDescription: null,
      noIndex: false,
      children: [
        {
          id: '21',
          parentId: '2',
          slug: 'hidden',
          name: 'Hidden',
          listingKind: 'BOUQUETS',
          sortOrder: 1,
          visibility: 'HIDDEN',
          seoTitle: null,
          seoDescription: null,
          noIndex: false,
          children: [],
        },
      ],
    },
  ];
  const items = navItemsFromCategoryTree(withBukety);
  const bukety = items.find((item) => item.id === 'bukety');
  assert.equal(bukety?.href, '/bukety');
  assert.equal(bukety?.children?.length ?? 0, 0);
});

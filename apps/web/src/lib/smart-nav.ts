/**
 * Build primary storefront nav from live catalog + taxonomy.
 * Roots stay fixed; dropdown links are not hand-maintained per flower.
 */

import {
  CATALOG_HUB_SLUG,
  catalogPublicHref,
  isCanonicalListingHub,
  occasionDiscoveryHref,
  recipientDiscoveryHref,
  type CatalogCategoryTreeNodeDto,
  type CatalogListingKind,
  type FlowerTypeDto,
  type TaxonomyRefDto,
  type TaxonomyVisibility,
} from '@bouquet-one/contracts';
import type { PrimaryNavChild, PrimaryNavGroup, PrimaryNavItem } from '@/components/storefront/primary-nav';

const MAX_FLOWER_LINKS = 24;
const MAX_BOUQUET_LINKS = 12;
const MAX_GIFT_LINKS = 10;
const MAX_OCCASION_LINKS = 12;
const MAX_RECIPIENT_LINKS = 10;

type VisibleRef = { slug: string; name: string; sortOrder?: number };

function isVisible(visibility: TaxonomyVisibility | string | undefined): boolean {
  return visibility !== 'HIDDEN';
}

function flattenCategories(
  nodes: CatalogCategoryTreeNodeDto[],
): CatalogCategoryTreeNodeDto[] {
  const out: CatalogCategoryTreeNodeDto[] = [];
  for (const node of nodes) {
    out.push(node);
    if (node.children?.length) out.push(...flattenCategories(node.children));
  }
  return out;
}

function categoryLinks(
  tree: CatalogCategoryTreeNodeDto[],
  listingKind: CatalogListingKind,
  limit: number,
): PrimaryNavChild[] {
  return flattenCategories(tree)
    .filter(
      (node) =>
        isVisible(node.visibility) &&
        node.listingKind === listingKind &&
        !isCanonicalListingHub(node),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit)
    .map((node) => ({
      id: `cat-${node.slug}`,
      label: node.name,
      href: catalogPublicHref(node.slug),
    }));
}

function visibleSorted(refs: VisibleRef[], limit: number): VisibleRef[] {
  return [...refs]
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'ru'),
    )
    .slice(0, limit);
}

function chunkChildren(children: PrimaryNavChild[], size: number): PrimaryNavChild[][] {
  if (children.length <= size) return [children];
  const mid = Math.ceil(children.length / 2);
  return [children.slice(0, mid), children.slice(mid)];
}

function group(
  id: string,
  label: string,
  iconKey: string,
  children: PrimaryNavChild[],
): PrimaryNavGroup {
  return { id, label, iconKey, children };
}

/**
 * Short street line for the utility bar (drop postal / city suffix when present).
 */
export function shortShopAddress(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;
  const cleaned = address
    .replace(/,\s*\d{6}\s*$/u, '')
    .replace(/,\s*г\.\s*Гродно\s*$/iu, '')
    .trim();
  return cleaned || address.trim();
}

/** Yandex Maps search URL — works in browser and opens the app when installed. */
export function yandexMapsHref(address: string): string {
  return `https://yandex.by/maps/?text=${encodeURIComponent(address)}`;
}

export type SmartNavSources = {
  flowers?: FlowerTypeDto[];
  occasions?: TaxonomyRefDto[];
  recipients?: TaxonomyRefDto[];
  categoryTree?: CatalogCategoryTreeNodeDto[];
};

export function buildSmartPrimaryNav(sources: SmartNavSources = {}): PrimaryNavItem[] {
  const flowers = (sources.flowers ?? [])
    .filter((f) => isVisible(f.visibility))
    .map((f) => ({ slug: f.slug, name: f.name, sortOrder: f.sortOrder }));
  const occasions = (sources.occasions ?? []).map((o) => ({
    slug: o.slug,
    name: o.name,
  }));
  const recipients = (sources.recipients ?? []).map((r) => ({
    slug: r.slug,
    name: r.name,
  }));
  const tree = sources.categoryTree ?? [];

  const bouquetPages = categoryLinks(tree, 'BOUQUETS', MAX_BOUQUET_LINKS);
  const giftPages = categoryLinks(tree, 'GIFTS', MAX_GIFT_LINKS);
  const compositionPages = categoryLinks(tree, 'COMPOSITIONS', 6);

  const flowerChildren: PrimaryNavChild[] = [
    {
      id: 'stems-all',
      label: 'Все цветы поштучно',
      href: catalogPublicHref(CATALOG_HUB_SLUG.STEMS),
    },
    ...visibleSorted(flowers, MAX_FLOWER_LINKS).map((flower) => ({
      id: `ft-${flower.slug}`,
      label: flower.name,
      href: `${catalogPublicHref(CATALOG_HUB_SLUG.STEMS)}?flower=${encodeURIComponent(flower.slug)}`,
    })),
  ];
  const flowerChunks = chunkChildren(flowerChildren, 10);

  const occasionChildren = visibleSorted(occasions, MAX_OCCASION_LINKS).map((item) => ({
    id: `occ-${item.slug}`,
    label: item.name,
    href: occasionDiscoveryHref(item.slug),
  }));
  const recipientChildren = visibleSorted(recipients, MAX_RECIPIENT_LINKS).map((item) => ({
    id: `rec-${item.slug}`,
    label: item.name,
    href: recipientDiscoveryHref(item.slug),
  }));

  const buketyGroups: PrimaryNavGroup[] = [
    group(
      'bukety-pages',
      'Подборки',
      'bouquet',
      bouquetPages.length > 0
        ? [
            {
              id: 'all-bouquets',
              label: 'Все букеты',
              href: catalogPublicHref(CATALOG_HUB_SLUG.BOUQUETS),
            },
            ...bouquetPages,
          ]
        : [
            {
              id: 'all-bouquets',
              label: 'Все букеты',
              href: catalogPublicHref(CATALOG_HUB_SLUG.BOUQUETS),
            },
            {
              id: 'rose-bouquets',
              label: 'Букеты из роз',
              href: catalogPublicHref('rose-bouquets'),
            },
            {
              id: 'with-roses',
              label: 'Букеты с розами',
              href: catalogPublicHref('bouquets-with-roses'),
            },
            {
              id: 'mono',
              label: 'Монобукеты',
              href: catalogPublicHref('mono-bouquets'),
            },
            {
              id: 'signature',
              label: 'Авторские букеты',
              href: catalogPublicHref('signature-bouquets'),
            },
            {
              id: 'mixed',
              label: 'Смешанные букеты',
              href: catalogPublicHref('mixed-bouquets'),
            },
          ],
    ),
  ];
  if (compositionPages.length > 0) {
    buketyGroups.push(group('bukety-comp', 'Композиции', 'leaf', compositionPages));
  } else {
    buketyGroups.push(
      group('bukety-comp', 'Композиции', 'leaf', [
        {
          id: 'compositions',
          label: 'Все композиции',
          href: catalogPublicHref(CATALOG_HUB_SLUG.COMPOSITIONS),
        },
      ]),
    );
  }

  const cvetyGroups = flowerChunks.map((chunk, index) =>
    group(
      index === 0 ? 'cvety-main' : `cvety-more-${index}`,
      index === 0 ? 'По виду' : 'Ещё',
      index === 0 ? 'flower' : 'leaf',
      chunk,
    ),
  );

  const povodGroups: PrimaryNavGroup[] = [];
  if (occasionChildren.length > 0) {
    povodGroups.push(group('povod-main', 'По случаю', 'heart', occasionChildren));
  } else {
    povodGroups.push(
      group('povod-main', 'По случаю', 'heart', [
        { id: 'birthday', label: 'День рождения', href: '/povod/den-rozhdeniya' },
        { id: 'love', label: 'Любимым', href: '/povod/lyubimym' },
        { id: 'march8', label: '8 марта', href: '/povod/8-marta' },
        { id: 'wedding', label: 'Свадьба', href: '/povod/svadba' },
      ]),
    );
  }
  if (recipientChildren.length > 0) {
    povodGroups.push(group('povod-who', 'Кому', 'gift', recipientChildren));
  } else {
    povodGroups.push(
      group('povod-who', 'Кому', 'gift', [
        { id: 'her', label: 'Ей', href: '/komu/ei' },
        { id: 'him', label: 'Ему', href: '/komu/emu' },
        { id: 'mom', label: 'Маме', href: '/komu/mame' },
        { id: 'bride', label: 'Невесте', href: '/komu/neveste' },
      ]),
    );
  }

  const giftChildren: PrimaryNavChild[] =
    giftPages.length > 0
      ? [
          {
            id: 'gifts-all',
            label: 'Все подарки',
            href: catalogPublicHref(CATALOG_HUB_SLUG.GIFTS),
          },
          ...giftPages,
        ]
      : [
          {
            id: 'gifts-all',
            label: 'Все подарки',
            href: catalogPublicHref(CATALOG_HUB_SLUG.GIFTS),
          },
          {
            id: 'cards',
            label: 'Открытки',
            href: catalogPublicHref('otkrytki'),
          },
        ];

  return [
    {
      id: 'bukety',
      label: 'Букеты',
      href: catalogPublicHref(CATALOG_HUB_SLUG.BOUQUETS),
      panelLayout: 'COLUMNS',
      groups: buketyGroups,
    },
    {
      id: 'cvety',
      label: 'Цветы',
      href: catalogPublicHref(CATALOG_HUB_SLUG.STEMS),
      panelLayout: 'COLUMNS',
      groups: cvetyGroups,
    },
    {
      id: 'povod',
      label: 'Повод',
      href: '/povod',
      panelLayout: 'COLUMNS',
      groups: povodGroups,
    },
    {
      id: 'podarki',
      label: 'Подарки',
      href: catalogPublicHref(CATALOG_HUB_SLUG.GIFTS),
      panelLayout: 'COLUMNS',
      children: giftChildren,
    },
    {
      id: 'akcii',
      label: 'Акции',
      href: '/akcii',
      accent: true,
      panelLayout: 'COLUMNS',
    },
  ];
}

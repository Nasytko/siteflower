import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSmartPrimaryNav,
  shortShopAddress,
  yandexMapsHref,
} from './smart-nav';

test('shortShopAddress drops postal and city suffix', () => {
  assert.equal(
    shortShopAddress('пр-т Янки Купалы, 67А, г. Гродно, 230000'),
    'пр-т Янки Купалы, 67А',
  );
});

test('yandexMapsHref encodes address', () => {
  const href = yandexMapsHref('пр-т Янки Купалы, 67А');
  assert.match(href, /^https:\/\/yandex\.by\/maps\/\?text=/);
  assert.match(href, /%D0%9A%D1%83%D0%BF%D0%B0%D0%BB%D1%8B/);
});

test('buildSmartPrimaryNav fills flowers from taxonomy without hand list', () => {
  const nav = buildSmartPrimaryNav({
    flowers: [
      {
        id: '1',
        slug: 'roza',
        name: 'Роза',
        sortOrder: 1,
        visibility: 'VISIBLE',
        compositionClass: 'BLOOM',
      },
      {
        id: '2',
        slug: 'pion',
        name: 'Пион',
        sortOrder: 2,
        visibility: 'VISIBLE',
        compositionClass: 'BLOOM',
      },
      {
        id: '3',
        slug: 'hidden',
        name: 'Скрытый',
        sortOrder: 3,
        visibility: 'HIDDEN',
        compositionClass: null,
      },
    ],
    occasions: [{ id: 'o1', slug: 'den-rozhdeniya', name: 'День рождения' }],
    recipients: [{ id: 'r1', slug: 'mame', name: 'Маме' }],
    categoryTree: [
      {
        id: 'b',
        parentId: null,
        slug: 'bouquets',
        name: 'Букеты',
        listingKind: 'BOUQUETS',
        sortOrder: 0,
        visibility: 'VISIBLE',
        seoTitle: null,
        seoDescription: null,
        noIndex: false,
        children: [
          {
            id: 'rb',
            parentId: 'b',
            slug: 'rose-bouquets',
            name: 'Букеты из роз',
            listingKind: 'BOUQUETS',
            sortOrder: 1,
            visibility: 'VISIBLE',
            seoTitle: null,
            seoDescription: null,
            noIndex: false,
            children: [],
          },
        ],
      },
    ],
  });

  const cvety = nav.find((item) => item.id === 'cvety');
  const labels = cvety?.groups?.flatMap((g) => g.children.map((c) => c.label)) ?? [];
  assert.ok(labels.includes('Роза'));
  assert.ok(labels.includes('Пион'));
  assert.equal(labels.includes('Скрытый'), false);

  const bukety = nav.find((item) => item.id === 'bukety');
  const bouquetLabels =
    bukety?.groups?.flatMap((g) => g.children.map((c) => c.label)) ?? [];
  assert.ok(bouquetLabels.includes('Букеты из роз'));
  assert.ok(bouquetLabels.includes('Все букеты'));

  const povod = nav.find((item) => item.id === 'povod');
  assert.ok(
    povod?.groups?.some((g) => g.children.some((c) => c.href === '/povod/den-rozhdeniya')),
  );
  assert.ok(povod?.groups?.some((g) => g.children.some((c) => c.href === '/komu/mame')));
});

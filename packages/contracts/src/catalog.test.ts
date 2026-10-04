import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPercentOff,
  budgetRangeMatchesPrice,
  BULK_PRODUCTS_MAX_ITEMS,
  BULK_PRODUCT_OPERATIONS,
  COMMERCIAL_AVAILABILITIES,
  deriveDisplayPercentOff,
  derivePriceRange,
  formatPriceRangeLabel,
  heightBandWhere,
  isBulkProductOperation,
  isCommercialAvailability,
  isHeightBandId,
  normalizeSlug,
  defaultProductSeoTitle,
  productCardSubtitle,
  flowerItemDisplayName,
  flowerItemIdentityKey,
  suggestProductNameFromComposition,
  resolveCompositionSetupStatus,
} from './catalog.js';

test('resolveCompositionSetupStatus', () => {
  assert.equal(
    resolveCompositionSetupStatus({
      flowerTypeId: 't',
      components: [],
    }),
    'legacy_pending',
  );
  assert.equal(
    resolveCompositionSetupStatus({
      flowerTypeId: 't',
      components: [{ flowerItemId: 'i1' }],
    }),
    'ready',
  );
  assert.equal(resolveCompositionSetupStatus({ components: [] }), 'empty');
});

test('flowerItemIdentityKey and display name', () => {
  assert.equal(
    flowerItemIdentityKey({
      flowerTypeId: 't',
      flowerVarietyId: null,
      flowerOriginId: 'o',
      heightCm: 50,
    }),
    't|_|o|50',
  );
  assert.equal(
    flowerItemDisplayName({
      typeName: 'Роза',
      varietyName: 'Мондиаль',
      originName: 'Эквадор',
      heightCm: 60,
    }),
    'Роза Мондиаль · Эквадор · 60 см',
  );
});

test('suggestProductNameFromComposition', () => {
  assert.equal(
    suggestProductNameFromComposition([{ displayName: 'Хризантема Бигуди', quantity: 9 }]),
    'Букет из 9 Хризантема Бигуди',
  );
});

test('derivePriceRange single', () => {
  const range = derivePriceRange('BYN', [9900n]);
  assert.equal(range?.single, true);
  assert.equal(range?.label.includes('99,00'), true);
});

test('derivePriceRange range label', () => {
  const range = derivePriceRange('BYN', [9900n, 14900n, 19900n]);
  assert.equal(range?.single, false);
  assert.equal(range?.minMinor, '9900');
  assert.equal(range?.maxMinor, '19900');
  assert.match(range!.label, /^от /);
});

test('normalizeSlug', () => {
  assert.equal(normalizeSlug('  Améli Premium  '), 'ameli-premium');
  assert.equal(normalizeSlug('Красные розы'), 'krasnye-rozy');
  assert.equal(normalizeSlug('Букеты на день рождения'), 'bukety-na-den-rozhdeniya');
  assert.equal(normalizeSlug('Белые пионы'), 'belye-piony');
  assert.equal(normalizeSlug('Ёлка'), 'elka');
  assert.equal(normalizeSlug('Объектъ'), 'obekt');
  assert.equal(normalizeSlug('Розы / Roses 2024!!!'), 'rozy-roses-2024');
  assert.equal(normalizeSlug('---'), '');
});

test('defaultProductSeoTitle', () => {
  assert.match(defaultProductSeoTitle('Амели'), /Амели/);
  assert.match(defaultProductSeoTitle('Амели'), /BUKET №1/);
});

test('formatPriceRangeLabel', () => {
  const f = formatPriceRangeLabel('BYN', 100n, 100n);
  assert.equal(f.single, true);
});

test('applyPercentOff rounds half-up', () => {
  assert.equal(applyPercentOff(10000n, 15), 8500n);
  assert.equal(applyPercentOff(99n, 10), 89n);
});

test('deriveDisplayPercentOff', () => {
  assert.equal(deriveDisplayPercentOff(12000n, 9900n), 17);
  assert.equal(deriveDisplayPercentOff(100n, 100n), null);
});

test('budgetRangeMatchesPrice', () => {
  assert.equal(budgetRangeMatchesPrice(8000n, null, 8000n), true);
  assert.equal(budgetRangeMatchesPrice(8001n, null, 8000n), false);
  assert.equal(budgetRangeMatchesPrice(25000n, 25000n, null), true);
  assert.equal(budgetRangeMatchesPrice(24999n, 25000n, null), false);
  assert.equal(budgetRangeMatchesPrice(10000n, 8000n, 12000n), true);
});

test('commercial availability enum is closed and validated', () => {
  assert.deepEqual([...COMMERCIAL_AVAILABILITIES], [
    'AVAILABLE',
    'TEMPORARILY_UNAVAILABLE',
    'PREORDER',
    'SEASONAL',
  ]);
  for (const value of COMMERCIAL_AVAILABILITIES) {
    assert.equal(isCommercialAvailability(value), true);
  }
  assert.equal(isCommercialAvailability('OUT_OF_STOCK'), false);
  assert.equal(isCommercialAvailability('ARCHIVED'), false);
});

test('bulk product operations V1 are closed and capped', () => {
  assert.deepEqual([...BULK_PRODUCT_OPERATIONS], [
    'PUBLISH',
    'UNPUBLISH',
    'SET_AVAILABILITY',
  ]);
  assert.equal(isBulkProductOperation('PUBLISH'), true);
  assert.equal(isBulkProductOperation('DELETE'), false);
  assert.equal(BULK_PRODUCTS_MAX_ITEMS, 50);
});

test('productCardSubtitle skips parts already in the name', () => {
  assert.equal(
    productCardSubtitle({
      name: 'Роза Мондиаль 60 см Эквадор',
      heightCm: 60,
      originName: 'Эквадор',
    }),
    null,
  );
  assert.equal(
    productCardSubtitle({
      name: 'Роза Мондиаль',
      heightCm: 60,
      originName: 'Эквадор',
    }),
    '60 см · Эквадор',
  );
  assert.equal(
    productCardSubtitle({
      name: 'Роза Мондиаль 50 см',
      heightCm: 50,
      originName: 'Фермерская',
    }),
    'Фермерская',
  );
});

test('heightBandWhere maps storefront bands', () => {
  assert.equal(isHeightBandId('60_70'), true);
  assert.equal(isHeightBandId('nope'), false);
  assert.deepEqual(heightBandWhere('up_to_50'), { lte: 50 });
  assert.deepEqual(heightBandWhere('50_60'), { gte: 50, lte: 60 });
  assert.deepEqual(heightBandWhere('70_plus'), { gte: 70 });
});

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
  assertComponentFlowerRefXor,
  defaultFilterKeysForPreset,
  suggestProductNameFromComposition,
  deriveCompositionManagerSummary,
  deriveCompositionKind,
  formatCompositionSummaryLine,
  isCanonicalListingHub,
  productKindsForListingKind,
  resolveCategoryListingScope,
  resolveStoredCompositionKind,
  suggestVisualPaletteColorIds,
  deriveProductEditorReadiness,
} from './catalog.js';

test('flowerItemIdentityKey and display name', () => {
  assert.equal(
    flowerItemIdentityKey({
      flowerTypeId: 't',
      flowerVarietyId: null,
      flowerOriginId: 'o',
      heightCm: 50,
    }),
    't|_|_|o|50',
  );
  assert.equal(
    flowerItemDisplayName({
      typeName: 'Роза',
      varietyName: 'Мондиаль',
      originName: 'Эквадор',
      heightCm: 60,
    }),
    'Роза Мондиаль 60 см Эквадор',
  );
  assert.equal(
    flowerItemDisplayName({
      typeName: 'Роза',
      formName: 'Классическая',
      varietyName: 'Мондиаль',
      originName: 'Эквадор',
      stemLengthCm: 60,
    }),
    'Роза Мондиаль 60 см Эквадор',
    'form is omitted from retail canonical name',
  );
  assert.equal(
    flowerItemDisplayName({
      typeName: 'Гербера',
      varietyName: null,
      originName: 'Голландия',
      stemLengthCm: 50,
    }),
    'Гербера 50 см Голландия',
  );
  assert.equal(
    flowerItemDisplayName({
      typeName: 'Тюльпан',
      stemLengthCm: 50,
    }),
    'Тюльпан 50 см',
  );
});

test('deriveCompositionKind scenarios (mono / mixed / greenery / unknown)', () => {
  // 1. Mono red roses
  assert.equal(deriveCompositionKind([{ role: 'PRIMARY', typeName: 'Роза' }]), 'MONO');
  // 2. Mono roses of different colors (same type)
  assert.equal(
    deriveCompositionKind([
      { role: 'PRIMARY', typeName: 'Роза', typeId: 'rose' },
      { role: 'PRIMARY', typeName: 'Роза', typeId: 'rose' },
    ]),
    'MONO',
  );
  // 3. Mixed white roses + white eustoma
  assert.equal(
    deriveCompositionKind([
      { role: 'PRIMARY', typeName: 'Роза' },
      { role: 'PRIMARY', typeName: 'Эустома' },
    ]),
    'MIXED',
  );
  // 5. Mono with decorative greenery
  assert.equal(
    deriveCompositionKind([
      { role: 'PRIMARY', typeName: 'Роза' },
      { role: 'GREENERY', typeName: 'Эвкалипт' },
    ]),
    'MONO',
  );
  // 6. Unknown / empty composition
  assert.equal(deriveCompositionKind([]), 'UNKNOWN');
  assert.equal(deriveCompositionKind([{ role: 'GREENERY', typeName: 'Эвкалипт' }]), 'UNKNOWN');
});

test('resolveStoredCompositionKind: STEM/gift never store mono', () => {
  assert.equal(resolveStoredCompositionKind('BOUQUET', 'MONO'), 'MONO');
  assert.equal(resolveStoredCompositionKind('COMPOSITION', 'MIXED'), 'MIXED');
  assert.equal(resolveStoredCompositionKind('STEM', 'MONO'), 'UNKNOWN');
  assert.equal(resolveStoredCompositionKind('GIFT', 'MIXED'), 'UNKNOWN');
  assert.equal(resolveStoredCompositionKind('PLANT', 'MONO'), 'UNKNOWN');
});

test('productKindsForListingKind and canonical hubs', () => {
  assert.deepEqual(productKindsForListingKind('BOUQUETS'), ['BOUQUET']);
  assert.deepEqual(productKindsForListingKind('FLOWERS'), ['STEM']);
  assert.equal(isCanonicalListingHub({ slug: 'bukety', listingKind: 'BOUQUETS' }), true);
  assert.equal(isCanonicalListingHub({ slug: 'rozy', listingKind: 'FLOWERS' }), false);
  assert.equal(isCanonicalListingHub({ slug: 'otkrytki', listingKind: 'GIFTS' }), false);
});

test('resolveCategoryListingScope: hubs are productKind-only (no stale category OR)', () => {
  assert.deepEqual(
    resolveCategoryListingScope({ slug: 'bukety', parentId: null, listingKind: 'BOUQUETS' }),
    {
      useCategoryTree: false,
      productKinds: ['BOUQUET'],
      matchCategoryOrProductKind: false,
    },
  );
  assert.deepEqual(
    resolveCategoryListingScope({ slug: 'tsvety', parentId: null, listingKind: 'FLOWERS' }),
    {
      useCategoryTree: false,
      productKinds: ['STEM'],
      matchCategoryOrProductKind: false,
    },
  );
  assert.deepEqual(
    resolveCategoryListingScope({ slug: 'podarki', parentId: null, listingKind: 'GIFTS' }),
    {
      useCategoryTree: false,
      productKinds: ['GIFT'],
      matchCategoryOrProductKind: false,
    },
  );
});

test('resolveCategoryListingScope: flower leaf and monobukety use composition, not category', () => {
  assert.deepEqual(
    resolveCategoryListingScope({ slug: 'rozy', parentId: 'tsvety-id', listingKind: 'FLOWERS' }),
    {
      useCategoryTree: false,
      productKinds: ['STEM'],
      scopeFlowerTypeSlugs: ['rozy'],
    },
  );
  assert.deepEqual(
    resolveCategoryListingScope({
      slug: 'monobukety',
      parentId: 'bukety-id',
      listingKind: 'BOUQUETS',
    }),
    {
      useCategoryTree: false,
      productKinds: ['BOUQUET', 'COMPOSITION'],
      scopeCompositionKinds: ['MONO'],
    },
  );
});

test('resolveCategoryListingScope: otkrytki/svechi stay category-tree merchandising', () => {
  assert.deepEqual(
    resolveCategoryListingScope({ slug: 'otkrytki', parentId: null, listingKind: 'GIFTS' }),
    { useCategoryTree: true },
  );
  assert.deepEqual(
    resolveCategoryListingScope({ slug: 'svechi', parentId: null, listingKind: 'GIFTS' }),
    { useCategoryTree: true },
  );
});

test('deriveCompositionKind: two rose varieties stay mono', () => {
  assert.equal(
    deriveCompositionKind([
      { role: 'PRIMARY', typeId: 'rose', typeName: 'Роза' },
      { role: 'PRIMARY', typeId: 'rose', typeName: 'Роза' },
    ]),
    'MONO',
  );
});

test('formatCompositionSummaryLine hides mono label for STEM', () => {
  assert.equal(
    formatCompositionSummaryLine({
      kind: 'MONO',
      typeNames: ['Роза'],
      colorNames: ['Красный'],
      productKind: 'STEM',
    }),
    'Роза · Красный гамма',
  );
  assert.equal(
    formatCompositionSummaryLine({
      kind: 'MONO',
      typeNames: ['Роза'],
      colorNames: ['Красный'],
      productKind: 'BOUQUET',
    }),
    'Монобукет · Роза · Красный гамма',
  );
});

test('suggestVisualPaletteColorIds skips greenery', () => {
  assert.deepEqual(
    suggestVisualPaletteColorIds([
      { role: 'PRIMARY', colorId: 'c1' },
      { role: 'GREENERY', colorId: 'c2' },
      { role: 'PRIMARY', colorId: 'c1' },
      { role: 'PRIMARY', colorId: 'c3' },
    ]),
    ['c1', 'c3'],
  );
});

test('suggestProductNameFromComposition', () => {
  assert.equal(
    suggestProductNameFromComposition([
      {
        displayName: 'Хризантема Бигуди',
        quantity: 9,
        typeName: 'Хризантема',
        varietyName: 'Бигуди',
      },
    ]),
    'Букет из хризантем Бигуди',
  );
  assert.equal(
    suggestProductNameFromComposition([
      { displayName: 'Роза Мондиаль 60 см Эквадор', quantity: 1 },
    ]),
    'Роза Мондиаль',
  );
  assert.equal(
    suggestProductNameFromComposition([
      {
        displayName: 'Роза Мондиаль 60 см Эквадор',
        quantity: 15,
        typeName: 'Роза',
        varietyName: 'Мондиаль',
      },
    ]),
    'Букет из роз Мондиаль',
  );
  assert.equal(
    suggestProductNameFromComposition([
      { displayName: 'Роза Мондиаль 60 см Эквадор', quantity: null },
    ]),
    'Роза Мондиаль',
  );
  assert.equal(
    suggestProductNameFromComposition([
      { displayName: 'Роза Мондиаль 60 см Эквадор', quantity: 7, typeName: 'Роза' },
      { displayName: 'Эустома', quantity: 3, typeName: 'Эустома' },
      { displayName: 'Эвкалипт', quantity: 2, typeName: 'Эвкалипт' },
    ]),
    'Букет из роз, эустомы и эвкалипта',
  );
  assert.equal(
    suggestProductNameFromComposition([
      {
        displayName: 'Роза Мондиаль 60 см Эквадор',
        quantity: 5,
        typeName: 'Роза',
        varietyName: 'Мондиаль',
      },
      {
        displayName: 'Роза Жизель 50 см Кения',
        quantity: 3,
        typeName: 'Роза',
        varietyName: 'Жизель',
      },
    ]),
    'Букет из роз Мондиаль и Жизель',
  );
  assert.equal(
    suggestProductNameFromComposition([
      { displayName: 'Роза', quantity: 1, typeName: 'Роза', varietyName: 'А' },
      { displayName: 'Роза', quantity: 1, typeName: 'Роза', varietyName: 'Б' },
      { displayName: 'Роза', quantity: 1, typeName: 'Роза', varietyName: 'В' },
    ]),
    'Букет из роз разных сортов',
  );
  assert.equal(
    suggestProductNameFromComposition([
      { displayName: 'Роза', quantity: 1, typeName: 'Роза' },
      { displayName: 'Эустома', quantity: 1, typeName: 'Эустома' },
      { displayName: 'Эвкалипт', quantity: 1, typeName: 'Эвкалипт' },
      { displayName: 'Хризантема', quantity: 1, typeName: 'Хризантема' },
    ]),
    'Авторский букет',
  );
});

test('deriveCompositionManagerSummary', () => {
  const summary = deriveCompositionManagerSummary([
    {
      typeName: 'Роза',
      varietyName: 'Мондиаль',
      originName: 'Эквадор',
      stemLengthCm: 60,
    },
    { typeName: 'Эустома' },
  ]);
  assert.deepEqual(summary.flowerTypes, ['Роза', 'Эустома']);
  assert.equal(summary.varieties.includes('Мондиаль'), true);
  assert.equal(summary.origins.includes('Эквадор'), true);
  assert.equal(summary.stemLengthLabel, '60 см');
});

test('deriveProductEditorReadiness', () => {
  const ready = deriveProductEditorReadiness({
    name: 'Букет',
    slug: 'buket',
    catalogCategoryId: 'cat-1',
    variants: [{ status: 'ACTIVE', priceMajor: '69,00' }],
    hasPrimaryImage: true,
    shortDescription: 'Коротко',
    description: 'Длинно',
    compositionHasFlowerItem: true,
  });
  assert.equal(ready.readyToPublish, true);
  const withoutLongDesc = deriveProductEditorReadiness({
    name: 'Букет',
    slug: 'buket',
    catalogCategoryId: 'cat-1',
    variants: [{ status: 'ACTIVE', priceMajor: '69,00' }],
    hasPrimaryImage: true,
    shortDescription: 'Коротко',
    description: '',
    compositionHasFlowerItem: true,
  });
  assert.equal(withoutLongDesc.readyToPublish, true);
  assert.equal(withoutLongDesc.items.find((item) => item.id === 'description')?.requiredForPublish, false);
  const zeroPrice = deriveProductEditorReadiness({
    name: 'Букет',
    slug: 'buket',
    catalogCategoryId: 'cat-1',
    variants: [{ status: 'ACTIVE', priceMajor: '0,00' }],
    hasPrimaryImage: true,
    shortDescription: 'Коротко',
    description: 'Длинно',
    compositionHasFlowerItem: true,
  });
  assert.equal(zeroPrice.readyToPublish, false);
  assert.equal(zeroPrice.items.find((item) => item.id === 'price')?.ok, false);
  const blocked = deriveProductEditorReadiness({
    name: 'Букет',
    slug: 'buket',
    catalogCategoryId: null,
    variants: [{ status: 'ACTIVE', priceMajor: '' }],
    hasPrimaryImage: false,
    shortDescription: '',
    description: '',
    compositionHasFlowerItem: false,
  });
  assert.equal(blocked.readyToPublish, false);
  assert.match(blocked.blockingLabels.join(' '), /цена|фото|описание/);
  const giftReady = deriveProductEditorReadiness({
    name: 'Ваза',
    slug: 'vaza',
    catalogCategoryId: 'cat-1',
    productKind: 'GIFT',
    variants: [{ status: 'ACTIVE', priceMajor: '25,00' }],
    hasPrimaryImage: true,
    shortDescription: 'Подарок',
    description: '',
    compositionHasFlowerItem: false,
  });
  assert.equal(giftReady.readyToPublish, true);
  assert.equal(giftReady.items.find((item) => item.id === 'composition')?.requiredForPublish, false);
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

test('heightBandWhere maps non-overlapping stem-height bands', () => {
  assert.equal(isHeightBandId('60_70'), true);
  assert.equal(isHeightBandId('nope'), false);
  assert.deepEqual(heightBandWhere('up_to_50'), { lte: 50 });
  assert.deepEqual(heightBandWhere('50_60'), { gt: 50, lte: 60 });
  assert.deepEqual(heightBandWhere('60_70'), { gt: 60, lte: 70 });
  assert.deepEqual(heightBandWhere('70_plus'), { gt: 70 });
});

test('assertComponentFlowerRefXor requires flowerItemId', () => {
  assert.deepEqual(assertComponentFlowerRefXor({ flowerItemId: 'a' }), {
    flowerItemId: 'a',
  });
  assert.throws(
    () => assertComponentFlowerRefXor({ flowerItemId: null }),
    /COMPONENT_NO_REF/,
  );
  assert.throws(
    () => assertComponentFlowerRefXor({ flowerItemId: '  ' }),
    /COMPONENT_NO_REF/,
  );
});

test('defaultFilterKeysForPreset seeds category filter pools', () => {
  assert.ok(defaultFilterKeysForPreset('FLOWERS').includes('flower_type'));
  assert.ok(defaultFilterKeysForPreset('FLOWERS').includes('stem_height'));
  assert.ok(defaultFilterKeysForPreset('BOUQUETS').includes('occasion'));
  assert.equal(defaultFilterKeysForPreset('CARDS').includes('stem_height'), false);
});

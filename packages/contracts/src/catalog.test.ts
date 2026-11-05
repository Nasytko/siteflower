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
  quoteFlowerVariety,
  suggestStemProductName,
  isPlaceholderProductName,
  evaluateProductDeleteImpact,
  evaluateTaxonomyDeleteImpact,
  evaluateFlowerFormDeleteImpact,
  evaluateCatalogPageDeleteImpact,
  resolveRelatedProductLink,
  flowerItemIdentityKey,
  assertComponentFlowerRefXor,
  defaultFilterKeysForPreset,
  suggestProductNameFromComposition,
  deriveCompositionManagerSummary,
  computeLinePriceMinor,
  resolvePackagingAddonSurchargeMinor,
  deriveCompositionKind,
  formatCompositionSummaryLine,
  adminProductCompositionSummary,
  publicProductCompositionSummary,
  COMPOSITION_SUMMARY_EMPTY,
  isCanonicalListingHub,
  isProductKind,
  isValidErpSkuFormat,
  normalizeErpSku,
  PRODUCT_KINDS,
  productKindsForListingKind,
  resolveCatalogCategoryIdForProductKind,
  resolveCategoryListingScope,
  resolveFlowerTypeCompositionClass,
  resolveStoredCompositionKind,
  deriveProductEditorReadiness,
  resolveProductDescription,
  productDescriptionHasLegacyConflict,
  resolveProductMetaDescription,
} from './catalog.js';

test('normalizeErpSku: trim, uppercase, strip spaces; empty → null', () => {
  assert.equal(normalizeErpSku(null), null);
  assert.equal(normalizeErpSku(undefined), null);
  assert.equal(normalizeErpSku(''), null);
  assert.equal(normalizeErpSku('   '), null);
  assert.equal(normalizeErpSku('  ab-12  '), 'AB-12');
  assert.equal(normalizeErpSku('pack 01'), 'PACK01');
  assert.equal(isValidErpSkuFormat('AB-12'), true);
  assert.equal(isValidErpSkuFormat('PACK.01_X'), true);
  assert.equal(isValidErpSkuFormat('-BAD'), false);
  assert.equal(isValidErpSkuFormat('has space'), false);
});

test('ProductKind is independent of ERP SKU prefixes', () => {
  for (const kind of PRODUCT_KINDS) {
    assert.equal(isProductKind(kind), true);
  }
  assert.equal(isProductKind('STEM'), true);
  assert.equal(isProductKind('PIECE'), false);
  assert.equal(isProductKind('BQ-'), false);
  assert.equal(normalizeErpSku('BQ-100'), 'BQ-100');
  assert.equal(isProductKind(normalizeErpSku('BQ-100')!), false);
});

test('computeLinePriceMinor snapshots option erpSku without changing totals', () => {
  const priced = computeLinePriceMinor({
    quantity: 2,
    baseUnitPriceMinor: 1000n,
    options: [
      {
        groupId: 'g1',
        groupName: 'Упаковка',
        valueId: 'v1',
        valueName: 'Крафт',
        surchargeMinor: 100n,
        chargeMode: 'PER_LINE',
        erpSku: 'WRAP-01',
      },
    ],
  });
  assert.equal(priced.optionsTotalMinor, 100n);
  assert.equal(priced.lineTotalMinor, 2100n);
  assert.equal(priced.optionsSnapshot[0]?.erpSku, 'WRAP-01');
});

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
    'Роза «Мондиаль», 60 см',
  );
  assert.equal(
    flowerItemDisplayName({
      typeName: 'Роза',
      formName: 'кустовая',
      varietyName: 'Жизель',
      originName: 'Эквадор',
      stemLengthCm: 60,
    }),
    'Роза кустовая «Жизель», 60 см',
  );
  assert.equal(
    flowerItemDisplayName({
      typeName: 'Роза кустовая',
      formName: 'кустовая',
      varietyName: 'Жизель',
      stemLengthCm: 60,
    }),
    'Роза кустовая «Жизель», 60 см',
    'form is not repeated when already in the type name',
  );
  assert.equal(
    flowerItemDisplayName({
      typeName: 'Гербера',
      varietyName: null,
      originName: 'Голландия',
      stemLengthCm: 50,
    }),
    'Гербера, 50 см',
  );
  assert.equal(
    flowerItemDisplayName({
      typeName: 'Тюльпан',
      stemLengthCm: 50,
    }),
    'Тюльпан, 50 см',
  );
  assert.equal(quoteFlowerVariety('«Жизель»'), '«Жизель»');
  assert.equal(
    suggestStemProductName({
      typeName: 'Роза',
      formName: 'кустовая',
      varietyName: 'Жизель',
      stemLengthCm: 60,
    }),
    'Роза кустовая «Жизель», 60 см',
  );
  assert.equal(isPlaceholderProductName('Новый букет', 'BOUQUET'), true);
  assert.equal(isPlaceholderProductName('Осенний закат', 'BOUQUET'), false);
});

test('deriveCompositionKind scenarios (BLOOM / DECORATIVE / unclassified)', () => {
  const bloom = (typeId: string) => ({ typeId, compositionClass: 'BLOOM' as const });

  assert.equal(deriveCompositionKind([bloom('rose')]), 'MONO');
  assert.equal(deriveCompositionKind([bloom('rose'), bloom('eustoma')]), 'MIXED');
  assert.equal(
    deriveCompositionKind([
      bloom('rose'),
      {
        typeId: 'eucalyptus',
        flowerItem: { flowerType: { id: 'euc', compositionClass: 'DECORATIVE' } },
      },
    ]),
    'MONO',
  );
  assert.equal(
    deriveCompositionKind([
      { flowerItem: { flowerType: { id: 'euc', compositionClass: 'DECORATIVE' } } },
    ]),
    'UNKNOWN',
  );
  assert.equal(
    deriveCompositionKind([bloom('rose'), { typeId: 'mystery', compositionClass: null }]),
    'UNKNOWN',
  );
  assert.equal(deriveCompositionKind([]), 'UNKNOWN');
  assert.equal(deriveCompositionKind([bloom('rose'), bloom('rose')]), 'MONO');
  assert.equal(deriveCompositionKind([{ typeId: 'rose' }]), 'UNKNOWN');
});

test('computeLinePriceMinor: PER_LINE + PER_UNIT options', () => {
  const priced = computeLinePriceMinor({
    quantity: 3,
    baseUnitPriceMinor: 1000n,
    options: [
      {
        groupId: 'g1',
        groupName: 'Упаковка',
        valueId: 'v1',
        valueName: 'Крафт',
        surchargeMinor: 200n,
        chargeMode: 'PER_LINE',
      },
      {
        groupId: 'g2',
        groupName: 'Лента',
        valueId: 'v2',
        valueName: 'Атлас',
        surchargeMinor: 50n,
        chargeMode: 'PER_UNIT',
      },
    ],
  });
  // goods 3000 + craft 200 + ribbon 150 = 3350
  assert.equal(priced.lineTotalMinor, 3350n);
  assert.equal(priced.optionsTotalMinor, 350n);
  // unitPriceMinor keeps historical meaning (variant unit, no option share)
  assert.equal(priced.unitPriceMinor, 1000n);
  assert.equal(priced.baseUnitPriceMinor, 1000n);
  assert.equal(priced.unitPriceMinor * 3n + priced.optionsTotalMinor, priced.lineTotalMinor);
  assert.equal(priced.optionsSnapshot.length, 2);
});

test('computeLinePriceMinor: no options preserves legacy unit×qty = lineTotal', () => {
  const priced = computeLinePriceMinor({ quantity: 2, baseUnitPriceMinor: 15900n });
  assert.equal(priced.unitPriceMinor, 15900n);
  assert.equal(priced.optionsTotalMinor, 0n);
  assert.equal(priced.lineTotalMinor, 31800n);
});

test('computeLinePriceMinor: PER_LINE charged once regardless of quantity', () => {
  const priced = computeLinePriceMinor({
    quantity: 5,
    baseUnitPriceMinor: 1000n,
    options: [
      {
        groupId: 'g1',
        groupName: 'Упаковка',
        valueId: 'v1',
        valueName: 'Крафт',
        surchargeMinor: 300n,
        chargeMode: 'PER_LINE',
      },
    ],
  });
  assert.equal(priced.unitPriceMinor, 1000n);
  assert.equal(priced.optionsTotalMinor, 300n);
  assert.equal(priced.lineTotalMinor, 5300n);
});

test('computeLinePriceMinor: PER_UNIT scales with quantity', () => {
  const priced = computeLinePriceMinor({
    quantity: 4,
    baseUnitPriceMinor: 2000n,
    options: [
      {
        groupId: 'g2',
        groupName: 'Лента',
        valueId: 'v2',
        valueName: 'Атлас',
        surchargeMinor: 50n,
        chargeMode: 'PER_UNIT',
      },
    ],
  });
  assert.equal(priced.unitPriceMinor, 2000n);
  assert.equal(priced.optionsTotalMinor, 200n);
  assert.equal(priced.lineTotalMinor, 8200n);
});

test('resolveStoredCompositionKind: STEM/gift never store mono', () => {
  assert.equal(resolveStoredCompositionKind('BOUQUET', 'MONO'), 'MONO');
  assert.equal(resolveStoredCompositionKind('COMPOSITION', 'MIXED'), 'MIXED');
  assert.equal(resolveStoredCompositionKind('STEM', 'MONO'), 'UNKNOWN');
  assert.equal(resolveStoredCompositionKind('GIFT', 'MIXED'), 'UNKNOWN');
  assert.equal(resolveStoredCompositionKind('PLANT', 'MONO'), 'UNKNOWN');
});

test('duplicate compositionKind must re-derive — never copy stale product cache', () => {
  const staleCache = 'MONO' as const;
  const components = [
    { typeId: 'rose', compositionClass: 'BLOOM' as const },
    { typeId: 'eu', compositionClass: null },
  ];
  const derived = deriveCompositionKind(components);
  assert.equal(derived, 'UNKNOWN');
  // Wrong path (pre-fix): resolveStored(productKind, source.compositionKind)
  assert.equal(resolveStoredCompositionKind('BOUQUET', staleCache), 'MONO');
  // Correct path: re-derive from live FlowerType.compositionClass
  assert.equal(resolveStoredCompositionKind('BOUQUET', derived), 'UNKNOWN');
});

test('null compositionClass never falls back to BLOOM', () => {
  assert.equal(resolveFlowerTypeCompositionClass({ typeId: 'x' }), null);
  assert.equal(resolveFlowerTypeCompositionClass({ compositionClass: null }), null);
  assert.equal(
    resolveFlowerTypeCompositionClass({
      flowerItem: { flowerType: { compositionClass: undefined } },
    }),
    null,
  );
  assert.equal(deriveCompositionKind([{ typeId: 'rose' }]), 'UNKNOWN');
  assert.equal(
    deriveCompositionKind([
      { typeId: 'rose', compositionClass: 'BLOOM' },
      { typeId: 'greenery', compositionClass: 'DECORATIVE' },
    ]),
    'MONO',
  );
  assert.equal(
    resolveStoredCompositionKind(
      'BOUQUET',
      deriveCompositionKind([
        { typeId: 'rose', compositionClass: 'BLOOM' },
        { typeId: 'eustoma', compositionClass: 'BLOOM' },
      ]),
    ),
    'MIXED',
  );
});

test('productKindsForListingKind and canonical hubs', () => {
  assert.deepEqual(productKindsForListingKind('BOUQUETS'), ['BOUQUET']);
  assert.deepEqual(productKindsForListingKind('FLOWERS'), ['STEM']);
  assert.equal(isCanonicalListingHub({ slug: 'bouquets', listingKind: 'BOUQUETS' }), true);
  assert.equal(isCanonicalListingHub({ slug: 'bukety', listingKind: 'BOUQUETS' }), false);
  assert.equal(isCanonicalListingHub({ slug: 'roses', listingKind: 'FLOWERS' }), false);
  assert.equal(isCanonicalListingHub({ slug: 'otkrytki', listingKind: 'GIFTS' }), false);
});

test('resolveCatalogCategoryIdForProductKind: non-gifts always get hub', () => {
  for (const kind of ['BOUQUET', 'COMPOSITION', 'STEM'] as const) {
    assert.equal(
      resolveCatalogCategoryIdForProductKind({
        productKind: kind,
        requestedId: 'leaf-rozy',
        hubId: 'hub-id',
        requestedListingKind: 'BOUQUETS',
      }),
      'hub-id',
    );
    assert.equal(
      resolveCatalogCategoryIdForProductKind({
        productKind: kind,
        requestedId: null,
        hubId: 'hub-id',
        requestedListingKind: null,
      }),
      'hub-id',
    );
  }
});

test('resolveCatalogCategoryIdForProductKind: gifts keep GIFTS subtype, reject floral', () => {
  assert.equal(
    resolveCatalogCategoryIdForProductKind({
      productKind: 'GIFT',
      requestedId: 'otkrytki',
      hubId: 'podarki-hub',
      requestedListingKind: 'GIFTS',
    }),
    'otkrytki',
  );
  assert.equal(
    resolveCatalogCategoryIdForProductKind({
      productKind: 'GIFT',
      requestedId: 'bukety-leaf',
      hubId: 'podarki-hub',
      requestedListingKind: 'BOUQUETS',
    }),
    'podarki-hub',
  );
  assert.equal(
    resolveCatalogCategoryIdForProductKind({
      productKind: 'GIFT',
      requestedId: null,
      hubId: 'podarki-hub',
      requestedListingKind: null,
    }),
    'podarki-hub',
  );
});

test('resolveCategoryListingScope: hubs are productKind-only (no stale category OR)', () => {
  assert.deepEqual(
    resolveCategoryListingScope({ slug: 'bouquets', parentId: null, listingKind: 'BOUQUETS' }),
    {
      useCategoryTree: false,
      productKinds: ['BOUQUET'],
    },
  );
  assert.deepEqual(
    resolveCategoryListingScope({ slug: 'stems', parentId: null, listingKind: 'FLOWERS' }),
    {
      useCategoryTree: false,
      productKinds: ['STEM'],
    },
  );
  assert.deepEqual(
    resolveCategoryListingScope({ slug: 'gifts', parentId: null, listingKind: 'GIFTS' }),
    {
      useCategoryTree: false,
      productKinds: ['GIFT'],
    },
  );
});

test('resolveCategoryListingScope: flower leaf does not bind page slug to FlowerType', () => {
  assert.deepEqual(
    resolveCategoryListingScope({ slug: 'rozy', parentId: 'tsvety-id', listingKind: 'FLOWERS' }),
    {
      useCategoryTree: false,
      productKinds: ['STEM'],
      resolveFlowerTypeFromPageSlug: true,
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

test('resolveCategoryListingScope: SYSTEM_HUB and THEMATIC do not use category tree', () => {
  assert.deepEqual(
    resolveCategoryListingScope({
      slug: 'bukety',
      parentId: null,
      listingKind: 'BOUQUETS',
      pageKind: 'SYSTEM_HUB',
    }),
    { useCategoryTree: false, productKinds: ['BOUQUET'] },
  );
  assert.deepEqual(
    resolveCategoryListingScope({
      slug: 'bukety-iz-roz',
      parentId: 'bukety-id',
      listingKind: 'BOUQUETS',
      pageKind: 'THEMATIC',
      rules: { productKinds: ['BOUQUET'], onlyFlowerType: 'roza' },
    }),
    { useCategoryTree: false },
  );
});

test('adminProductCompositionSummary covers commercial kinds', () => {
  assert.equal(
    adminProductCompositionSummary({
      productKind: 'BOUQUET',
      components: [
        { typeName: 'Роза', compositionClass: 'BLOOM' },
        { typeName: 'Эустома', compositionClass: 'BLOOM' },
        {
          typeName: 'Эвкалипт',
          flowerItem: { flowerType: { name: 'Эвкалипт', compositionClass: 'DECORATIVE' } },
        },
      ],
    }),
    'Розы, Эустомы',
  );
  assert.equal(
    publicProductCompositionSummary({
      productKind: 'BOUQUET',
      components: [
        { typeName: 'Роза', compositionClass: 'BLOOM' },
        { typeName: 'Эустома', compositionClass: 'BLOOM' },
        {
          typeName: 'Эвкалипт',
          flowerItem: { flowerType: { name: 'Эвкалипт', compositionClass: 'DECORATIVE' } },
        },
      ],
    }),
    'Розы, Эустомы',
  );
  assert.equal(
    adminProductCompositionSummary({
      productKind: 'COMPOSITION',
      components: [
        { typeName: 'Роза', compositionClass: 'BLOOM' },
        { typeName: 'Хризантема', compositionClass: 'BLOOM' },
      ],
    }),
    'Розы, Хризантемы',
  );
  assert.equal(
    adminProductCompositionSummary({
      productKind: 'STEM',
      components: [
        {
          flowerItem: {
            flowerType: { name: 'Роза', compositionClass: 'BLOOM' },
            flowerVariety: { name: 'Жизель' },
          },
        },
      ],
    }),
    'Роза · Жизель',
  );
  assert.equal(
    adminProductCompositionSummary({
      productKind: 'GIFT',
      catalogCategoryName: 'Открытки',
      components: [],
    }),
    'Открытки',
  );
  assert.equal(
    adminProductCompositionSummary({ productKind: 'BOUQUET', components: [] }),
    COMPOSITION_SUMMARY_EMPTY,
  );
  assert.equal(
    adminProductCompositionSummary({ productKind: 'GIFT', components: [] }),
    COMPOSITION_SUMMARY_EMPTY,
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

test('suggestProductNameFromComposition', () => {
  assert.equal(
    suggestProductNameFromComposition([
      {
        displayName: 'Хризантема Бигуди',
        typeName: 'Хризантема',
        varietyName: 'Бигуди',
      },
    ]),
    'Хризантема «Бигуди»',
  );
  assert.equal(
    suggestProductNameFromComposition([{ displayName: 'Роза «Мондиаль», 60 см' }]),
    'Роза «Мондиаль»',
  );
  assert.equal(
    suggestProductNameFromComposition([
      {
        displayName: 'Роза «Мондиаль», 60 см',
        typeName: 'Роза',
        varietyName: 'Мондиаль',
      },
    ]),
    'Роза «Мондиаль»',
  );
  assert.equal(
    suggestProductNameFromComposition([
      { displayName: 'Роза Мондиаль 60 см Эквадор', typeName: 'Роза' },
      { displayName: 'Эустома', typeName: 'Эустома' },
      { displayName: 'Эвкалипт', typeName: 'Эвкалипт' },
    ]),
    'Букет из роз, эустомы и эвкалипта',
  );
  assert.equal(
    suggestProductNameFromComposition([
      {
        displayName: 'Роза Мондиаль 60 см Эквадор',
        typeName: 'Роза',
        varietyName: 'Мондиаль',
      },
      {
        displayName: 'Роза Жизель 50 см Кения',
        typeName: 'Роза',
        varietyName: 'Жизель',
      },
    ]),
    'Букет из роз «Мондиаль» и «Жизель»',
  );
  assert.equal(
    suggestProductNameFromComposition([
      { displayName: 'Роза', typeName: 'Роза', varietyName: 'А' },
      { displayName: 'Роза', typeName: 'Роза', varietyName: 'Б' },
      { displayName: 'Роза', typeName: 'Роза', varietyName: 'В' },
    ]),
    'Букет из роз разных сортов',
  );
  assert.equal(
    suggestProductNameFromComposition([
      { displayName: 'Роза', typeName: 'Роза' },
      { displayName: 'Эустома', typeName: 'Эустома' },
      { displayName: 'Эвкалипт', typeName: 'Эвкалипт' },
      { displayName: 'Хризантема', typeName: 'Хризантема' },
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

test('FlowerItemDto color is optional attribute (not identity)', () => {
  // Identity ignores color — same stem can gain/lose color without forking SKU.
  const keyA = flowerItemIdentityKey({
    flowerTypeId: 't',
    flowerVarietyId: 'v',
    flowerOriginId: 'o',
    stemLengthCm: 60,
  });
  const keyB = flowerItemIdentityKey({
    flowerTypeId: 't',
    flowerVarietyId: 'v',
    flowerOriginId: 'o',
    stemLengthCm: 60,
  });
  assert.equal(keyA, keyB);
  assert.match(keyA, /^t\|/);
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
  assert.equal(
    ready.items.find((item) => item.id === 'shortDescription')?.label,
    'Описание товара',
  );
  assert.equal(ready.items.some((item) => item.id === 'description'), false);
  const legacyOnlyLong = deriveProductEditorReadiness({
    name: 'Букет',
    slug: 'buket',
    catalogCategoryId: 'cat-1',
    variants: [{ status: 'ACTIVE', priceMajor: '69,00' }],
    hasPrimaryImage: true,
    shortDescription: '',
    description: 'Только полное',
    compositionHasFlowerItem: true,
  });
  assert.equal(legacyOnlyLong.readyToPublish, true);
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

test('resolveProductDescription prefers short, falls back to legacy long', () => {
  assert.equal(
    resolveProductDescription({ shortDescription: 'Коротко', description: 'Длинно' }),
    'Коротко',
  );
  assert.equal(
    resolveProductDescription({ shortDescription: '  ', description: 'Только полное' }),
    'Только полное',
  );
  assert.equal(resolveProductDescription({ shortDescription: null, description: null }), null);
  assert.equal(
    productDescriptionHasLegacyConflict({
      shortDescription: 'A',
      description: 'B',
    }),
    true,
  );
  assert.equal(
    productDescriptionHasLegacyConflict({
      shortDescription: 'Same',
      description: 'Same',
    }),
    false,
  );
});

test('resolveProductMetaDescription priority: seo → body → name fallback', () => {
  assert.equal(
    resolveProductMetaDescription({
      name: 'Амели',
      seoDescription: 'Ручное SEO',
      shortDescription: 'Тело',
      description: 'Legacy',
    }),
    'Ручное SEO',
  );
  assert.equal(
    resolveProductMetaDescription({
      name: 'Амели',
      seoDescription: null,
      shortDescription: 'Тело товара',
      description: 'Другое',
    }),
    'Тело товара',
  );
  assert.equal(
    resolveProductMetaDescription({
      name: 'Амели',
      seoDescription: '   ',
      shortDescription: '',
      description: 'Только legacy полное',
    }),
    'Только legacy полное',
  );
  const fallback = resolveProductMetaDescription({
    name: 'Амели',
    seoDescription: null,
    shortDescription: null,
    description: null,
  });
  assert.match(fallback, /Амели/);
  assert.notEqual(
    fallback,
    resolveProductMetaDescription({
      name: 'Розы',
      seoDescription: null,
      shortDescription: null,
      description: null,
    }),
  );
  const long = 'слово '.repeat(200).trim();
  const meta = resolveProductMetaDescription({
    name: 'X',
    seoDescription: null,
    shortDescription: long,
  });
  assert.ok(meta.length <= 500);
  assert.equal(long.includes(meta.slice(0, 20)), true);
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

test('evaluateProductDeleteImpact blocks historical orders and lists detachable links', () => {
  const blocked = evaluateProductDeleteImpact({
    productId: 'p1',
    name: 'Роза',
    slug: 'roza',
    orderItemsCount: 3,
    familyMembersCount: 1,
    hasPromotion: true,
    bestsellerLinksCount: 0,
    catalogPinsCount: 0,
    mediaCount: 2,
  });
  assert.equal(blocked.canDelete, false);
  assert.equal(blocked.blockers[0]?.code, 'ORDERS');
  assert.equal(blocked.detachable.some((row) => row.code === 'FAMILY_MEMBERS'), true);

  const free = evaluateProductDeleteImpact({
    productId: 'p2',
    name: 'Пион',
    slug: 'pion',
    orderItemsCount: 0,
    familyMembersCount: 0,
    hasPromotion: false,
    bestsellerLinksCount: 0,
    catalogPinsCount: 0,
    mediaCount: 0,
  });
  assert.equal(free.canDelete, true);
  assert.equal(free.blockers.length, 0);
  assert.equal(free.detachable.length, 0);
});

test('resolveRelatedProductLink is mutual and rejects family merge', () => {
  assert.deepEqual(resolveRelatedProductLink(null, null), { type: 'create' });
  assert.deepEqual(resolveRelatedProductLink('a', null), { type: 'join', familyId: 'a' });
  assert.deepEqual(resolveRelatedProductLink(null, 'b'), { type: 'join', familyId: 'b' });
  assert.deepEqual(resolveRelatedProductLink('a', 'a'), { type: 'already', familyId: 'a' });
  assert.deepEqual(resolveRelatedProductLink('a', 'b'), {
    type: 'conflict',
    leftFamilyId: 'a',
    rightFamilyId: 'b',
  });
});

test('evaluateTaxonomyDeleteImpact allows unused rows and blocks live links', () => {
  assert.equal(evaluateTaxonomyDeleteImpact({ productsCount: 0 }).canDelete, true);
  const blocked = evaluateTaxonomyDeleteImpact({
    productsCount: 2,
    flowerItemsCount: 1,
    componentsCount: 3,
  });
  assert.equal(blocked.canDelete, false);
  assert.deepEqual(
    blocked.blockers.map((row) => row.code),
    ['PRODUCTS', 'FLOWER_ITEMS', 'COMPONENTS'],
  );
});

test('evaluateFlowerFormDeleteImpact and catalog page delete', () => {
  assert.equal(evaluateFlowerFormDeleteImpact(0).canDelete, true);
  assert.equal(evaluateFlowerFormDeleteImpact(4).canDelete, false);

  const hub = evaluateCatalogPageDeleteImpact({
    pageKind: 'SYSTEM_HUB',
    isSystem: true,
    status: 'LIVE',
    childrenCount: 0,
    navigationCount: 0,
    assignedProductsCount: 0,
  });
  assert.equal(hub.canDelete, false);
  assert.equal(hub.canUnpublish, false);

  const published = evaluateCatalogPageDeleteImpact({
    pageKind: 'THEMATIC',
    isSystem: false,
    status: 'PUBLISHED',
    childrenCount: 0,
    navigationCount: 0,
    assignedProductsCount: 0,
  });
  assert.equal(published.canDelete, false);
  assert.equal(published.canUnpublish, true);

  const draft = evaluateCatalogPageDeleteImpact({
    pageKind: 'THEMATIC',
    isSystem: false,
    status: 'DRAFT',
    childrenCount: 0,
    navigationCount: 0,
    assignedProductsCount: 0,
  });
  assert.equal(draft.canDelete, true);
});

test('resolvePackagingAddonSurchargeMinor: FIXED uses surchargeMinor', () => {
  assert.equal(
    resolvePackagingAddonSurchargeMinor(
      { pricingMode: 'FIXED', surchargeMinor: '800', tiers: [] },
      10_000n,
    ),
    800n,
  );
});

test('resolvePackagingAddonSurchargeMinor: TIERED matches inclusive bounds and open top', () => {
  const addon = {
    pricingMode: 'TIERED' as const,
    surchargeMinor: '0',
    tiers: [
      { maxBaseMinor: '6000', surchargeMinor: '800' },
      { maxBaseMinor: '11000', surchargeMinor: '1000' },
      { maxBaseMinor: null, surchargeMinor: '1500' },
    ],
  };
  assert.equal(resolvePackagingAddonSurchargeMinor(addon, 0n), 800n);
  assert.equal(resolvePackagingAddonSurchargeMinor(addon, 6000n), 800n);
  assert.equal(resolvePackagingAddonSurchargeMinor(addon, 6001n), 1000n);
  assert.equal(resolvePackagingAddonSurchargeMinor(addon, 11000n), 1000n);
  assert.equal(resolvePackagingAddonSurchargeMinor(addon, 11001n), 1500n);
});

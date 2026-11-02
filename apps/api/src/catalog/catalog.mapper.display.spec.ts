import {
  productDisplayFlowerAttrs,
  toProductListItemDto,
  toProductPublicDto,
  type ProductWithRelations,
} from './catalog.mapper';

function baseProduct(
  overrides: Partial<ProductWithRelations> = {},
): ProductWithRelations {
  return {
    id: 'p1',
    slug: 'test',
    name: 'Test',
    shortDescription: null,
    description: null,
    badgeLabel: null,
    erpSku: null,
    bouquetHeightCm: 45,
    catalogCategoryId: null,
    productKind: 'BOUQUET',
    compositionKind: 'UNKNOWN',
    compositionPrecision: 'UNKNOWN',
    compositionPrimaryComplete: false,
    compositionText: null,
    lifecycle: 'PUBLISHED',
    availability: 'AVAILABLE',
    currency: 'BYN',
    publishedAt: new Date(),
    publishAt: null,
    unpublishAt: null,
    version: 1,
    seoTitle: null,
    seoDescription: null,
    noIndex: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    catalogCategory: null,
    familyMember: null,
    variants: [
      {
        id: 'v1',
        productId: 'p1',
        name: 'Стандарт',
        priceMinor: 10000n,
        sortOrder: 0,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        promotionSalePrices: [],
        optionPrices: [],
      },
    ],
    components: [],
    media: [],
    occasions: [],
    recipients: [],
    colors: [],
    promotion: null,
    bestsellerLinks: [],
    optionGroups: [],
    traits: [],
    ...overrides,
  } as unknown as ProductWithRelations;
}

describe('productDisplayFlowerAttrs', () => {
  it('reads type/variety/origin and stem height from composition FlowerItem', () => {
    const product = baseProduct({
      components: [
        {
          id: 'c1',
          productId: 'p1',
          flowerItemId: 'fi1',
          displayName: 'Хризантема',
          quantity: 5,
          unit: 'STEM',
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          flowerItem: {
            id: 'fi1',
            flowerTypeId: 't2',
            flowerFormId: null,
            flowerVarietyId: 'v2',
            flowerOriginId: 'o2',
            colorId: null,
            stemLengthCm: 60,
            identityKey: 'k',
            slug: 'item',
            name: 'Хризантема Бигуди 60',
            sortOrder: 0,
            visibility: 'VISIBLE',
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            flowerType: { id: 't2', slug: 'hrizantema', name: 'Хризантема' },
            flowerForm: null,
            flowerVariety: { id: 'v2', slug: 'bigudi', name: 'Бигуди' },
            flowerOrigin: { id: 'o2', slug: 'ferma', name: 'Фермерская' },
            color: null,
          },
        },
      ],
    } as unknown as Partial<ProductWithRelations>);

    const attrs = productDisplayFlowerAttrs(product);
    expect(attrs.varietyName).toBe('Бигуди');
    expect(attrs.originName).toBe('Фермерская');
    expect(attrs.flowerOrigin?.slug).toBe('ferma');
    // Bouquet height stays Product.bouquetHeightCm — never stemLengthCm.
    expect(attrs.heightCm).toBe(45);
    expect(attrs.stemHeightCm).toBe(60);
    expect(attrs.heightCm).not.toBe(attrs.stemHeightCm);
  });

  it('returns null flower attrs when composition is empty', () => {
    const attrs = productDisplayFlowerAttrs(baseProduct());
    expect(attrs.flowerOrigin).toBeNull();
    expect(attrs.stemHeightCm).toBeNull();
    expect(attrs.heightCm).toBe(45);
  });
});

describe('toProductListItemDto composition summary', () => {
  const urlFor = (key: string) => `https://cdn.test/${key}`;

  it('maps bouquet mixed PRIMARY quantities and ignores greenery', () => {
    const dto = toProductListItemDto(
      baseProduct({
        productKind: 'BOUQUET',
        components: [
          {
            id: 'c1',
            productId: 'p1',
            flowerItemId: 'fi1',
            role: 'PRIMARY',
            quantity: 7,
            flowerItem: {
              flowerType: { id: 't1', slug: 'roza', name: 'Роза' },
              flowerVariety: null,
            },
          },
          {
            id: 'c2',
            productId: 'p1',
            flowerItemId: 'fi2',
            role: 'PRIMARY',
            quantity: 5,
            flowerItem: {
              flowerType: { id: 't2', slug: 'eustoma', name: 'Эустома' },
              flowerVariety: null,
            },
          },
          {
            id: 'c3',
            productId: 'p1',
            flowerItemId: 'fi3',
            role: 'GREENERY',
            quantity: 4,
            flowerItem: {
              flowerType: { id: 't3', slug: 'evkalipt', name: 'Эвкалипт' },
              flowerVariety: null,
            },
          },
        ],
      } as unknown as Partial<ProductWithRelations>),
      urlFor,
    );
    expect(dto.productKind).toBe('BOUQUET');
    // Default list mapping is public-safe (no exact recipe quantities).
    expect(dto.compositionSummary).toBe('Розы, Эустомы');
    expect(
      toProductListItemDto(
        baseProduct({
          productKind: 'BOUQUET',
          components: [
            {
              id: 'c1',
              productId: 'p1',
              flowerItemId: 'fi1',
              role: 'PRIMARY',
              quantity: 7,
              flowerItem: { flowerType: { id: 't1', slug: 'roza', name: 'Роза' } },
            },
            {
              id: 'c2',
              productId: 'p1',
              flowerItemId: 'fi2',
              role: 'PRIMARY',
              quantity: 5,
              flowerItem: { flowerType: { id: 't2', slug: 'eustoma', name: 'Эустома' } },
            },
            {
              id: 'c3',
              productId: 'p1',
              flowerItemId: 'fi3',
              role: 'GREENERY',
              quantity: 4,
              flowerItem: { flowerType: { id: 't3', slug: 'evkalipt', name: 'Эвкалипт' } },
            },
          ],
        } as unknown as Partial<ProductWithRelations>),
        urlFor,
        new Date(),
        { includeCompositionQuantities: true },
      ).compositionSummary,
    ).toBe('Розы × 7, Эустомы × 5');
  });

  it('maps stem as type · variety', () => {
    const dto = toProductListItemDto(
      baseProduct({
        productKind: 'STEM',
        components: [
          {
            id: 'c1',
            productId: 'p1',
            flowerItemId: 'fi1',
            role: 'PRIMARY',
            quantity: 1,
            flowerItem: {
              flowerType: { id: 't1', slug: 'roza', name: 'Роза' },
              flowerVariety: { id: 'v1', slug: 'gisel', name: 'Жизель' },
            },
          },
        ],
      } as unknown as Partial<ProductWithRelations>),
      urlFor,
    );
    expect(dto.productKind).toBe('STEM');
    expect(dto.compositionSummary).toBe('Роза · Жизель');
  });

  it('maps gift subtype from category name', () => {
    const dto = toProductListItemDto(
      baseProduct({
        productKind: 'GIFT',
        catalogCategory: { id: 'cat1', slug: 'otkrytki', name: 'Открытки' },
        components: [],
      } as unknown as Partial<ProductWithRelations>),
      urlFor,
    );
    expect(dto.productKind).toBe('GIFT');
    expect(dto.compositionSummary).toBe('Открытки');
  });

  it('maps empty composition to fallback copy', () => {
    const dto = toProductListItemDto(baseProduct({ productKind: 'COMPOSITION' }), urlFor);
    expect(dto.productKind).toBe('COMPOSITION');
    expect(dto.compositionSummary).toBe('Состав не указан');
  });
});

describe('toProductPublicDto composition (Task 04A)', () => {
  const urlFor = (key: string) => `/media/${key}`;

  it('omits exact recipe quantities from public components', () => {
    const dto = toProductPublicDto(
      baseProduct({
        erpSku: 'BQ-100',
        components: [
          {
            id: 'c1',
            productId: 'p1',
            flowerItemId: 'fi1',
            colorId: null,
            role: 'PRIMARY',
            displayName: 'Роза',
            quantity: 11,
            unit: 'STEM',
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            color: null,
            flowerItem: {
              imageUrl: null,
              flowerType: { slug: 'roza' },
            },
          },
        ],
      } as unknown as Partial<ProductWithRelations>),
      urlFor,
    );
    expect(dto.components).toHaveLength(1);
    expect(dto.components[0]).toEqual(
      expect.objectContaining({
        displayName: 'Роза',
        unit: 'STEM',
        flowerSlug: 'roza',
      }),
    );
    expect(dto.components[0]).not.toHaveProperty('quantity');
  });

  it('maps admin erpSku while allowing null for legacy products', () => {
    const withSku = toProductPublicDto(baseProduct({ erpSku: 'BQ-100' }), urlFor);
    const without = toProductPublicDto(baseProduct({ erpSku: null }), urlFor);
    // Public storefront DTO does not expose ERP SKU; admin mapper does.
    expect(withSku).not.toHaveProperty('erpSku');
    expect(without).not.toHaveProperty('erpSku');
  });
});

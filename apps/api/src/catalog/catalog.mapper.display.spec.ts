import { productDisplayFlowerAttrs, type ProductWithRelations } from './catalog.mapper';

function baseProduct(
  overrides: Partial<ProductWithRelations> = {},
): ProductWithRelations {
  return {
    id: 'p1',
    slug: 'test',
    name: 'Test',
    shortDescription: null,
    description: null,
    bouquetHeightCm: 45,
    catalogCategoryId: null,
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
    variants: [],
    components: [],
    media: [],
    occasions: [],
    recipients: [],
    colors: [],
    promotion: null,
    bestsellerLinks: [],
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

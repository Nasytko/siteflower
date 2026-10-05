import { productDisplayFlowerAttrs, type ProductWithRelations } from './catalog.mapper';

function baseProduct(
  overrides: Partial<ProductWithRelations> = {},
): ProductWithRelations {
  return {
    id: 'p1',
    name: 'Букет',
    slug: 'buket',
    bouquetHeightCm: 45,
    flowerType: { id: 'legacy-type', slug: 'roza', name: 'Роза', visibility: 'VISIBLE' },
    flowerVariety: null,
    flowerOrigin: { id: 'legacy-origin', slug: 'ekvador', name: 'Эквадор', visibility: 'VISIBLE' },
    components: [],
    ...overrides,
  } as unknown as ProductWithRelations;
}

describe('productDisplayFlowerAttrs composition-first', () => {
  it('prefers FlowerItem taxonomy over conflicting Product.flower* (Rose vs Chrysanthemum)', () => {
    const product = baseProduct({
      flowerType: { id: 'legacy-type', slug: 'roza', name: 'Роза', visibility: 'VISIBLE' },
      flowerVariety: {
        id: 'legacy-var',
        slug: 'mondial',
        name: 'Мондиаль',
        visibility: 'VISIBLE',
      },
      flowerOrigin: {
        id: 'legacy-origin',
        slug: 'ekvador',
        name: 'Эквадор',
        visibility: 'VISIBLE',
      },
      components: [
        {
          flowerItem: {
            id: 'item-1',
            stemLengthCm: 60,
            flowerType: { id: 't2', slug: 'hrizantema', name: 'Хризантема', visibility: 'VISIBLE' },
            flowerVariety: { id: 'v2', slug: 'bigudi', name: 'Бигуди', visibility: 'VISIBLE' },
            flowerOrigin: { id: 'o2', slug: 'ferma', name: 'Фермерская', visibility: 'VISIBLE' },
          },
        },
      ],
    } as unknown as Partial<ProductWithRelations>);

    const attrs = productDisplayFlowerAttrs(product);
    expect(attrs.flowerType?.name).toBe('Хризантема');
    expect(attrs.flowerType?.slug).toBe('hrizantema');
    expect(attrs.flowerVariety?.name).toBe('Бигуди');
    expect(attrs.flowerOrigin?.name).toBe('Фермерская');
    // Bouquet height stays Product.bouquetHeightCm — never stemLengthCm.
    expect(attrs.heightCm).toBe(45);
    expect(attrs.stemHeightCm).toBe(60);
    expect(attrs.heightCm).not.toBe(attrs.stemHeightCm);
  });

  it('falls back to Product.flower* when composition has no FlowerItem', () => {
    const attrs = productDisplayFlowerAttrs(baseProduct());
    expect(attrs.flowerType?.slug).toBe('roza');
    expect(attrs.flowerOrigin?.slug).toBe('ekvador');
    expect(attrs.stemHeightCm).toBeNull();
    expect(attrs.heightCm).toBe(45);
  });
});

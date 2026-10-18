import { isDominantFlowerType } from '@bouquet-one/contracts';
import { rulesToFilters } from './seo-landings.service';

describe('SEO landing rules → ProductListFilters', () => {
  it('maps chrysanthemum bouquet mono rule', () => {
    const filters = rulesToFilters({
      productKinds: ['BOUQUET'],
      flowerTypeIds: ['ft-chrys'],
      compositionKinds: ['MONO'],
    });
    expect(filters.productKinds).toEqual(['BOUQUET']);
    expect(filters.flowerTypeIds).toEqual(['ft-chrys']);
    expect(filters.compositionKinds).toEqual(['MONO']);
  });

  it('maps white roses as same-component type + component color', () => {
    const filters = rulesToFilters({
      productKinds: ['BOUQUET'],
      flowerTypeSlugs: ['rozy'],
      componentColorSlugs: ['belyy'],
    });
    expect(filters.flowerTypeSlugs).toEqual(['rozy']);
    expect(filters.componentColorSlugs).toEqual(['belyy']);
    expect(filters.colorSlugs).toBeUndefined();
  });

  it('maps 25 roses quantity with EXACT slug', () => {
    const filters = rulesToFilters({
      minFlowerTypeQuantity: 25,
      flowerTypeQuantitySlug: 'rozy',
      productKinds: ['BOUQUET'],
    });
    expect(filters.minFlowerTypeQuantity).toBe(25);
    expect(filters.flowerTypeQuantitySlug).toBe('rozy');
  });

  it('maps dominant flower type and recipients', () => {
    const filters = rulesToFilters({
      dominantFlowerTypeSlug: 'hrizantema',
      recipientIds: ['rec-1'],
      occasionSlugs: ['den-rozhdeniya'],
    });
    expect(filters.dominantFlowerTypeSlug).toBe('hrizantema');
    expect(filters.recipientIds).toEqual(['rec-1']);
    expect(filters.occasionSlugs).toEqual(['den-rozhdeniya']);
  });
});

describe('isDominantFlowerType', () => {
  it('accepts strict majority of comparable PRIMARY units', () => {
    expect(
      isDominantFlowerType(
        [
          { role: 'PRIMARY', quantity: 7, unit: 'STEM', flowerTypeSlug: 'hrizantema' },
          { role: 'PRIMARY', quantity: 3, unit: 'STEM', flowerTypeSlug: 'roza' },
          { role: 'GREENERY', quantity: 5, unit: 'STEM', flowerTypeSlug: 'evkalipt' },
        ],
        'hrizantema',
      ),
    ).toBe(true);
  });

  it('rejects mixed units and approximate/unknown quantities', () => {
    expect(
      isDominantFlowerType(
        [
          { role: 'PRIMARY', quantity: 5, unit: 'STEM', flowerTypeSlug: 'hrizantema' },
          { role: 'PRIMARY', quantity: 2, unit: 'BUNCH', flowerTypeSlug: 'roza' },
        ],
        'hrizantema',
      ),
    ).toBe(false);
    expect(
      isDominantFlowerType(
        [{ role: 'PRIMARY', quantity: null, unit: 'STEM', flowerTypeSlug: 'hrizantema' }],
        'hrizantema',
      ),
    ).toBe(false);
  });

  it('rejects tie between two primary types', () => {
    expect(
      isDominantFlowerType(
        [
          { role: 'PRIMARY', quantity: 5, unit: 'STEM', flowerTypeSlug: 'hrizantema' },
          { role: 'PRIMARY', quantity: 5, unit: 'STEM', flowerTypeSlug: 'roza' },
        ],
        'hrizantema',
      ),
    ).toBe(false);
  });
});

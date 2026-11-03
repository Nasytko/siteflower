import { rulesToFilters } from './catalog-match.service';

describe('catalog page rules → ProductListFilters', () => {
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

  it('maps dominant flower type and recipients', () => {
    const filters = rulesToFilters({
      dominantFlowerTypeSlug: 'hrizantema',
      recipientIds: ['rec-1'],
      occasionSlugs: ['den-rozhdeniya'],
    });
    expect(filters).not.toHaveProperty('dominantFlowerTypeSlug');
    expect(filters.recipientIds).toEqual(['rec-1']);
    expect(filters.occasionSlugs).toEqual(['den-rozhdeniya']);
  });

  it('maps product-facing aliases contains/only/compositionType/flowerColor', () => {
    const contains = rulesToFilters({
      containsFlowerType: 'roza',
      compositionType: 'MIXED',
      flowerColor: 'krasnyy',
      productKinds: ['BOUQUET'],
    });
    expect(contains.flowerTypeSlugs).toEqual(['roza']);
    expect(contains.compositionKinds).toEqual(['MIXED']);
    expect(contains.componentColorSlugs).toEqual(['krasnyy']);

    const only = rulesToFilters({
      onlyFlowerType: 'roza',
      productKinds: ['BOUQUET'],
    });
    expect(only.onlyFlowerTypeSlugs).toEqual(['roza']);
    expect(only.flowerTypeSlugs).toBeUndefined();
  });

  it('maps flowerForm on the same component as type', () => {
    const filters = rulesToFilters({
      flowerTypeSlugs: ['roza'],
      flowerFormSlugs: ['kustovaya'],
    });
    expect(filters.flowerFormSlugs).toEqual(['kustovaya']);
    expect(filters.flowerTypeSlugs).toEqual(['roza']);
  });

  it('maps traitKeys for authorial and similar managed traits', () => {
    const filters = rulesToFilters({
      productKinds: ['BOUQUET'],
      traitKeys: ['AUTHORIAL'],
    });
    expect(filters.traitKeys).toEqual(['AUTHORIAL']);
  });
});

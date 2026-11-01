import { describeCatalogPageRules, flowerTypeSlugsFromRules } from './placement-match.util';
import { rulesToFilters } from './catalog-match.service';

describe('catalog page placement rules', () => {
  it('describes only-roses vs contains-roses distinctly', () => {
    expect(
      describeCatalogPageRules({
        productKinds: ['BOUQUET'],
        onlyFlowerType: 'roza',
      }),
    ).toContain('только вид');
    expect(
      describeCatalogPageRules({
        productKinds: ['BOUQUET'],
        containsFlowerType: 'roza',
      }),
    ).toContain('содержит вид');
  });

  it('describes AUTHORIAL trait pages', () => {
    const summary = describeCatalogPageRules({
      productKinds: ['BOUQUET'],
      traitKeys: ['AUTHORIAL'],
    });
    expect(summary).toContain('авторский');
  });

  it('extracts flower type slugs from aliases for recommendation dedupe', () => {
    expect(flowerTypeSlugsFromRules({ containsFlowerType: 'roza' })).toEqual(['roza']);
    expect(flowerTypeSlugsFromRules({ onlyFlowerType: 'hrizantema' })).toEqual(['hrizantema']);
  });

  it('rulesToFilters for roses-only matches MONO-from-type filter shape', () => {
    const filters = rulesToFilters({
      productKinds: ['BOUQUET'],
      onlyFlowerType: 'roza',
    });
    expect(filters.onlyFlowerTypeSlugs).toEqual(['roza']);
    expect(filters.productKinds).toEqual(['BOUQUET']);
  });

  it('rulesToFilters for roses+greenery page uses contains, not only', () => {
    const filters = rulesToFilters({
      productKinds: ['BOUQUET'],
      containsFlowerType: 'roza',
    });
    expect(filters.flowerTypeSlugs).toEqual(['roza']);
    expect(filters.onlyFlowerTypeSlugs).toBeUndefined();
  });
});

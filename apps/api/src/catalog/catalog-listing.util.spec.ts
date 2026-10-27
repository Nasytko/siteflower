import { mergeListingIntoFilters } from './catalog-listing.util';

describe('catalog-listing.util', () => {
  it('prefers flowerTypeIds from page rules over facet slugs', () => {
    const merged = mergeListingIntoFilters(
      {
        pageRules: {
          productKinds: ['STEM'],
          flowerTypeIds: ['roza-id'],
        },
        productKinds: ['STEM'],
      },
      { flowerTypeSlugs: ['rozy'] },
    );
    expect(merged.flowerTypeIds).toEqual(['roza-id']);
    expect(merged.flowerTypeSlugs).toBeUndefined();
    expect(merged.productKinds).toEqual(['STEM']);
  });

  it('keeps gift tree membership from listing scope', () => {
    const merged = mergeListingIntoFilters({
      catalogCategoryIds: ['gift-leaf'],
    });
    expect(merged.catalogCategoryIds).toEqual(['gift-leaf']);
  });
});

import {
  gateListingFiltersByEnabledKeys,
  navigationCategoryTargetAvailability,
} from '@bouquet-one/contracts';

describe('navigationCategoryTargetAvailability', () => {
  it('marks VISIBLE categories available', () => {
    const status = navigationCategoryTargetAvailability({
      name: 'Розы',
      visibility: 'VISIBLE',
    });
    expect(status.available).toBe(true);
    expect(status.reason).toBeNull();
    expect(status.targetLabel).toContain('Розы');
  });

  it('marks HIDDEN categories unavailable without deleting the concept', () => {
    const status = navigationCategoryTargetAvailability({
      name: 'Розы',
      visibility: 'HIDDEN',
    });
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/скрыта/i);
    expect(status.targetLabel).toMatch(/скрыта/i);
  });

  it('marks missing categories unavailable', () => {
    const status = navigationCategoryTargetAvailability(null);
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/удалена/i);
  });
});

describe('gateListingFiltersByEnabledKeys', () => {
  it('keeps enabled facets and drops disabled ones', () => {
    const gated = gateListingFiltersByEnabledKeys(
      {
        colorSlugs: ['red'],
        flowerOriginSlugs: ['ecuador'],
        flowerTypeSlugs: ['roza'],
        promotionalOnly: true,
        heightCm: { lte: 50 },
      },
      ['color', 'flower_type', 'promo'],
    );
    expect(gated.colorSlugs).toEqual(['red']);
    expect(gated.flowerTypeSlugs).toEqual(['roza']);
    expect(gated.promotionalOnly).toBe(true);
    expect(gated.flowerOriginSlugs).toBeUndefined();
    expect(gated.heightCm).toBeUndefined();
  });

  it('clears price bounds when price is not enabled', () => {
    const gated = gateListingFiltersByEnabledKeys(
      { minPriceMinor: '1000', maxPriceMinor: '5000', colorSlugs: ['red'] },
      ['color'],
    );
    expect(gated.minPriceMinor).toBeUndefined();
    expect(gated.maxPriceMinor).toBeUndefined();
    expect(gated.colorSlugs).toEqual(['red']);
  });
});

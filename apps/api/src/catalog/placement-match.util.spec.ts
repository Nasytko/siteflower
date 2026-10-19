import { describeSeoLandingRules, flowerTypeSlugsFromRules } from './placement-match.util';

describe('placement-match.util', () => {
  it('describes contains + mono rules in Russian', () => {
    const text = describeSeoLandingRules({
      productKinds: ['BOUQUET'],
      flowerTypeSlugs: ['roza'],
      compositionKinds: ['MONO'],
    });
    expect(text).toMatch(/букет/);
    expect(text).toMatch(/roza/);
    expect(text).toMatch(/монобукет/);
  });

  it('collects type slugs from aliases for recommendation coverage', () => {
    expect(
      flowerTypeSlugsFromRules({
        containsFlowerType: 'hrizantema',
        onlyFlowerTypeSlugs: ['roza'],
      }).sort(),
    ).toEqual(['hrizantema', 'roza']);
  });
});

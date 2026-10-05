import {
  categoryPublicHref,
  navigationCategoryTargetAvailability,
  validateNavigationCustomHref,
} from '@bouquet-one/contracts';

describe('navigation menu helpers', () => {
  it('builds category hrefs with legacy hubs', () => {
    expect(categoryPublicHref('rozy')).toBe('/katalog/rozy');
    expect(categoryPublicHref('bukety')).toBe('/bukety');
    expect(categoryPublicHref('cvety')).toBe('/cvety');
  });

  it('accepts internal paths and https urls', () => {
    expect(validateNavigationCustomHref('/akcii')).toBe('/akcii');
    expect(validateNavigationCustomHref('https://example.com/x')).toContain('https://');
  });

  it('rejects unsafe schemes', () => {
    expect(() => validateNavigationCustomHref('javascript:alert(1)')).toThrow('NAV_HREF_UNSAFE');
    expect(() => validateNavigationCustomHref('//evil.test')).toThrow('NAV_HREF_UNSAFE');
    expect(() => validateNavigationCustomHref('http://insecure.test')).toThrow('NAV_HREF_UNSAFE');
  });

  it('marks HIDDEN and missing categories unavailable for navigation', () => {
    expect(navigationCategoryTargetAvailability(null).available).toBe(false);
    expect(
      navigationCategoryTargetAvailability({ name: 'Розы', visibility: 'HIDDEN' }).available,
    ).toBe(false);
    expect(
      navigationCategoryTargetAvailability({ name: 'Розы', visibility: 'VISIBLE' }).available,
    ).toBe(true);
    expect(
      navigationCategoryTargetAvailability({ name: 'Розы', visibility: 'HIDDEN' }).reason,
    ).toMatch(/скрыта/i);
  });
});

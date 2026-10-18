import { CATALOG_FILTER_KEYS, type CatalogFilterKey } from '@bouquet-one/contracts';

/** Mirrors CatalogFiltersService.PUBLIC_RUNTIME_FILTER_KEYS — storefront PLP wiring only. */
const PUBLIC_RUNTIME_FILTER_KEYS = new Set<CatalogFilterKey>([
  'price',
  'promo',
  'flower_type',
  'variety',
  'origin',
  'stem_height',
  'color',
  'occasion',
  'recipient',
  'composition_kind',
  'quantity',
]);

describe('catalog filter pool public runtime gate', () => {
  it('exposes only implemented PLP filters publicly', () => {
    for (const key of PUBLIC_RUNTIME_FILTER_KEYS) {
      expect(CATALOG_FILTER_KEYS).toContain(key);
    }
    expect(PUBLIC_RUNTIME_FILTER_KEYS.has('bouquet_height')).toBe(false);
  });

  it('keeps pool keys that may exist in admin but stay off public PLP', () => {
    const poolOnly = CATALOG_FILTER_KEYS.filter((key) => !PUBLIC_RUNTIME_FILTER_KEYS.has(key));
    expect(poolOnly).toContain('bouquet_height');
  });
});

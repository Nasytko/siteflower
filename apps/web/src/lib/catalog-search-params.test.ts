import assert from 'node:assert/strict';
import test from 'node:test';
import {
  catalogHasActiveFilters,
  catalogStateToListParams,
  catalogStateToQuery,
  majorBynToMinor,
  parseCatalogSearchParams,
  parseSlugListParam,
  toggleSlug,
} from './catalog-search-params';

test('majorBynToMinor converts whole BYN to minor units', () => {
  assert.equal(majorBynToMinor('150'), '15000');
  assert.equal(majorBynToMinor('0'), '0');
  assert.equal(majorBynToMinor('12.5'), undefined);
  assert.equal(majorBynToMinor(undefined), undefined);
});

test('parseCatalogSearchParams applies defaults and multi-slug lists', () => {
  const state = parseCatalogSearchParams({
    flower: 'rozy,piony',
    color: ['rozovyy', 'belyy'],
    sort: 'price_asc',
    q: 'амели',
    page: '2',
  });
  assert.deepEqual(state.flowers, ['rozy', 'piony']);
  assert.deepEqual(state.colors, ['rozovyy', 'belyy']);
  assert.equal(state.sort, 'price_asc');
  assert.equal(state.search, 'амели');
  assert.equal(state.page, 2);
});

test('parseSlugListParam de-duplicates and caps length', () => {
  assert.deepEqual(parseSlugListParam('rozy, rozy ,piony'), ['rozy', 'piony']);
  assert.deepEqual(parseSlugListParam(undefined), []);
});

test('toggleSlug adds and removes', () => {
  assert.deepEqual(toggleSlug(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleSlug(['a', 'b'], 'a'), ['b']);
});

test('catalogStateToListParams expands price bands and joins multi-slugs', () => {
  const params = catalogStateToListParams(
    parseCatalogSearchParams({ band: 'under-100', color: 'rozovyy,belyy', sort: 'featured' }),
  );
  assert.equal(params.maxPriceMinor, '10000');
  assert.equal(params.minPriceMinor, undefined);
  assert.equal(params.colorSlug, 'rozovyy,belyy');
  assert.equal(params.sort, 'featured');
});

test('catalogStateToQuery omits default sort and page 1', () => {
  assert.equal(catalogStateToQuery({ sort: 'featured', page: 1, flowers: [], colors: [], styles: [], categories: [], occasions: [], recipients: [] }), '');
  assert.equal(
    catalogStateToQuery({
      sort: 'newest',
      page: 2,
      flowers: ['piony'],
      colors: [],
      styles: [],
      categories: [],
      occasions: [],
      recipients: [],
    }),
    '?flower=piony&sort=newest&page=2',
  );
});

test('catalogHasActiveFilters detects merchandising filters', () => {
  assert.equal(catalogHasActiveFilters(parseCatalogSearchParams({})), false);
  assert.equal(catalogHasActiveFilters(parseCatalogSearchParams({ band: '100-150' })), true);
  assert.equal(catalogHasActiveFilters(parseCatalogSearchParams({ color: 'rozovyy,belyy' })), true);
});

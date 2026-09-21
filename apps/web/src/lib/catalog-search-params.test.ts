import assert from 'node:assert/strict';
import test from 'node:test';
import {
  catalogHasActiveFilters,
  catalogStateToListParams,
  catalogStateToQuery,
  majorBynToMinor,
  parseCatalogSearchParams,
} from './catalog-search-params';

test('majorBynToMinor converts whole BYN to minor units', () => {
  assert.equal(majorBynToMinor('150'), '15000');
  assert.equal(majorBynToMinor('0'), '0');
  assert.equal(majorBynToMinor('12.5'), undefined);
  assert.equal(majorBynToMinor(undefined), undefined);
});

test('parseCatalogSearchParams applies defaults and aliases', () => {
  const state = parseCatalogSearchParams({
    flower: 'rozy',
    sort: 'price_asc',
    q: 'амели',
    page: '2',
  });
  assert.equal(state.flower, 'rozy');
  assert.equal(state.sort, 'price_asc');
  assert.equal(state.search, 'амели');
  assert.equal(state.page, 2);
});

test('catalogStateToListParams expands price bands to minor units', () => {
  const params = catalogStateToListParams(
    parseCatalogSearchParams({ band: 'under-100', sort: 'featured' }),
  );
  assert.equal(params.maxPriceMinor, '10000');
  assert.equal(params.minPriceMinor, undefined);
  assert.equal(params.sort, 'featured');
});

test('catalogStateToQuery omits default sort and page 1', () => {
  assert.equal(catalogStateToQuery({ sort: 'featured', page: 1 }), '');
  assert.equal(
    catalogStateToQuery({ sort: 'newest', page: 2, flower: 'piony' }),
    '?flower=piony&sort=newest&page=2',
  );
});

test('catalogHasActiveFilters detects merchandising filters', () => {
  assert.equal(catalogHasActiveFilters(parseCatalogSearchParams({})), false);
  assert.equal(catalogHasActiveFilters(parseCatalogSearchParams({ band: '100-150' })), true);
});

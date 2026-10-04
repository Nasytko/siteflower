import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyKatalogSearchState,
  katalogHasActiveFilters,
  katalogHref,
  katalogStateToListParams,
  katalogStateToQuery,
  parseKatalogSearchParams,
} from './katalog-search-params';

test('parseKatalogSearchParams defaults', () => {
  const state = parseKatalogSearchParams({});
  assert.equal(state.sort, 'recommended');
  assert.equal(state.page, 1);
  assert.equal(state.height, null);
  assert.deepEqual(state.varieties, []);
});

test('parseKatalogSearchParams reads short query keys', () => {
  const state = parseKatalogSearchParams({
    var: 'red-naomi,freedom',
    color: 'krasnyy',
    h: '60_70',
    orig: 'ekvador',
    sort: 'price_desc',
    q: 'роза',
    page: '2',
  });

  assert.deepEqual(state.varieties, ['red-naomi', 'freedom']);
  assert.deepEqual(state.colors, ['krasnyy']);
  assert.equal(state.height, '60_70');
  assert.deepEqual(state.origins, ['ekvador']);
  assert.equal(state.sort, 'price_desc');
  assert.equal(state.search, 'роза');
  assert.equal(state.page, 2);
});

test('parseKatalogSearchParams ignores invalid height band', () => {
  assert.equal(parseKatalogSearchParams({ h: 'nope' }).height, null);
});

test('katalogStateToListParams maps to catalog API', () => {
  const state = parseKatalogSearchParams({ var: 'a', orig: 'b', h: '50_60', color: 'c' });
  const params = katalogStateToListParams('rozy', state);
  assert.equal(params.categorySlug, 'rozy');
  assert.equal(params.flowerVarietySlug, 'a');
  assert.equal(params.flowerOriginSlug, 'b');
  assert.equal(params.heightBand, '50_60');
  assert.equal(params.color, 'c');
});

test('katalogHasActiveFilters', () => {
  assert.equal(katalogHasActiveFilters(emptyKatalogSearchState()), false);
  assert.equal(katalogHasActiveFilters(parseKatalogSearchParams({ h: '70_plus' })), true);
});

test('katalogStateToQuery omits defaults', () => {
  assert.equal(katalogStateToQuery(emptyKatalogSearchState()), '');
  assert.equal(
    katalogStateToQuery(parseKatalogSearchParams({ var: 'x', page: '2' })),
    '?var=x&page=2',
  );
});

test('katalogHref resets page on filter patch', () => {
  assert.equal(
    katalogHref('rozy', parseKatalogSearchParams({ page: '3' }), { colors: ['belyy'] }),
    '/katalog/rozy?color=belyy',
  );
});

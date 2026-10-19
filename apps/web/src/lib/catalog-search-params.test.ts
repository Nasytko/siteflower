import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bouquetCountLabel,
  catalogActiveFilterCount,
  catalogCountLabel,
  catalogHasActiveFilters,
  catalogHref,
  catalogStateToListParams,
  catalogStateToQuery,
  emptyCatalogSearchState,
  parseCatalogSearchParams,
  parseSlugListParam,
  toggleSlug,
} from './catalog-search-params';

test('parseCatalogSearchParams defaults to recommended sort and page 1', () => {
  const state = parseCatalogSearchParams({});
  assert.equal(state.sort, 'recommended');
  assert.equal(state.page, 1);
  assert.deepEqual(state.budgets, []);
  assert.deepEqual(state.flowers, []);
});

test('parseCatalogSearchParams reads discovery dimensions', () => {
  const state = parseCatalogSearchParams({
    budget: 'range-1,range-2',
    occasion: 'den-rozhdeniya',
    recipient: ['mame', 'zhene'],
    color: 'belyy',
    flower: 'rozy,piony',
    sort: 'price_asc',
    q: 'амели',
    page: '2',
  });

  assert.deepEqual(state.budgets, ['range-1', 'range-2']);
  assert.deepEqual(state.occasions, ['den-rozhdeniya']);
  assert.deepEqual(state.recipients, ['mame', 'zhene']);
  assert.deepEqual(state.colors, ['belyy']);
  assert.deepEqual(state.flowers, ['rozy', 'piony']);
  assert.equal(state.sort, 'price_asc');
  assert.equal(state.search, 'амели');
  assert.equal(state.page, 2);
});

test('parseCatalogSearchParams ignores retired category/style/collection/size params', () => {
  const state = parseCatalogSearchParams({
    category: 'bukety',
    style: 'klassika',
    collection: 'izbrannoe',
    featured: '1',
    availability: 'AVAILABLE',
    size: 'sredniy',
  });

  assert.equal(catalogHasActiveFilters(state), false);
  assert.equal(catalogStateToQuery(state), '');
});

test('parseCatalogSearchParams falls back to recommended for unknown sorts', () => {
  assert.equal(parseCatalogSearchParams({ sort: 'featured' }).sort, 'recommended');
  assert.equal(parseCatalogSearchParams({ sort: 'nonsense' }).sort, 'recommended');
});

test('parseSlugListParam de-duplicates and accepts repeated params', () => {
  assert.deepEqual(parseSlugListParam('rozy, rozy ,piony'), ['rozy', 'piony']);
  assert.deepEqual(parseSlugListParam(['rozy', 'piony']), ['rozy', 'piony']);
  assert.deepEqual(parseSlugListParam(undefined), []);
});

test('toggleSlug adds and removes', () => {
  assert.deepEqual(toggleSlug(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleSlug(['a', 'b'], 'a'), ['b']);
});

test('catalogStateToListParams joins each dimension with the API vocabulary', () => {
  const params = catalogStateToListParams(
    parseCatalogSearchParams({ budget: 'r1,r2', color: 'belyy', flower: 'rozy', page: '3' }),
  );

  assert.equal(params.budget, 'r1,r2');
  assert.equal(params.color, 'belyy');
  assert.equal(params.flower, 'rozy');
  assert.equal(params.occasion, undefined);
  assert.equal(params.page, 3);
  assert.equal(params.sort, 'recommended');
  assert.equal(params.categorySlug, 'bukety');
});

test('catalogStateToQuery omits default sort and page 1', () => {
  assert.equal(catalogStateToQuery(emptyCatalogSearchState()), '');
  assert.equal(
    catalogStateToQuery({
      ...emptyCatalogSearchState(),
      flowers: ['piony'],
      budgets: ['r1'],
      sort: 'newest',
      page: 2,
    }),
    '?budget=r1&flower=piony&sort=newest&page=2',
  );
});

test('catalogHref resets paging when a filter changes', () => {
  const state = { ...emptyCatalogSearchState(), page: 4, colors: ['belyy'] };
  assert.equal(catalogHref(state, { colors: ['belyy', 'rozovyy'] }), '/bukety?color=belyy%2Crozovyy');
});

test('catalogActiveFilterCount counts each selected value', () => {
  const state = parseCatalogSearchParams({ color: 'belyy,rozovyy', budget: 'r1', q: 'амели' });
  assert.equal(catalogActiveFilterCount(state), 4);
  assert.equal(catalogHasActiveFilters(state), true);
});

test('bouquetCountLabel agrees with Russian plurals', () => {
  assert.equal(bouquetCountLabel(1), '1 букет');
  assert.equal(bouquetCountLabel(3), '3 букета');
  assert.equal(bouquetCountLabel(11), '11 букетов');
  assert.equal(bouquetCountLabel(21), '21 букет');
  assert.equal(bouquetCountLabel(0), '0 букетов');
});

test('catalogCountLabel follows listingKind', () => {
  assert.equal(catalogCountLabel(2, 'FLOWERS'), '2 товара');
  assert.equal(catalogCountLabel(1, 'FLOWERS'), '1 товар');
  assert.equal(catalogCountLabel(5, 'GIFTS'), '5 товаров');
  assert.equal(catalogCountLabel(2, 'BOUQUETS'), '2 букета');
  assert.equal(catalogCountLabel(3, 'COMPOSITIONS'), '3 композиции');
  assert.equal(catalogCountLabel(2, null), '2 товара');
});

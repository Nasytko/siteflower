import assert from 'node:assert/strict';
import test from 'node:test';
import { gateKatalogSearchState, parseKatalogSearchParams } from './katalog-search-params';

test('gateKatalogSearchState drops disabled filter params', () => {
  const raw = parseKatalogSearchParams({
    color: 'red',
    orig: 'ecuador',
    flower: 'roza',
    promo: '1',
    sort: 'price_asc',
    page: '2',
  });
  const gated = gateKatalogSearchState(raw, ['color', 'flower_type']);
  assert.deepEqual(gated.colors, ['red']);
  assert.deepEqual(gated.flowerTypes, ['roza']);
  assert.deepEqual(gated.origins, []);
  assert.equal(gated.promo, false);
  assert.equal(gated.sort, 'price_asc');
  assert.equal(gated.page, 2);
});

test('gateKatalogSearchState keeps promo when enabled', () => {
  const raw = parseKatalogSearchParams({ promo: '1', orig: 'ecuador' });
  const gated = gateKatalogSearchState(raw, ['promo']);
  assert.equal(gated.promo, true);
  assert.deepEqual(gated.origins, []);
});

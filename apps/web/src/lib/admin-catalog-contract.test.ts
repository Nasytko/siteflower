import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBestsellerGroupProductsBody,
  buildProductBestsellerGroupsBody,
  buildProductListQueryParams,
} from './admin-catalog-contract';
import { adminEndpoints, withQuery } from './admin-endpoints';

test('product bestseller groups path matches Nest controller', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(
    adminEndpoints.productBestsellerGroups(id),
    `/api/v1/admin/catalog/products/${id}/bestseller-groups`,
  );
  assert.doesNotMatch(adminEndpoints.productBestsellerGroups(id), /\/bestsellers$/);
});

test('product editor path matches Nest atomic save controller', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(adminEndpoints.productEditor(id), `/api/v1/admin/catalog/products/${id}/editor`);
});

test('product duplicate path matches Nest controller', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(
    adminEndpoints.productDuplicate(id),
    `/api/v1/admin/catalog/products/${id}/duplicate`,
  );
});

test('bestseller group products path and body use productIds', () => {
  const id = '22222222-2222-4222-8222-222222222222';
  assert.equal(
    adminEndpoints.bestsellerGroupProducts(id),
    `/api/v1/admin/catalog/bestsellers/${id}/products`,
  );
  const body = buildBestsellerGroupProductsBody(3, ['a', 'b']);
  assert.deepEqual(body, { expectedVersion: 3, productIds: ['a', 'b'] });
  assert.equal('products' in body, false);
});

test('product bestseller groups body uses groupIds', () => {
  const body = buildProductBestsellerGroupsBody(2, ['g1']);
  assert.deepEqual(body, { expectedVersion: 2, groupIds: ['g1'] });
});

test('product list query uses search / promotionalOnly / bestsellerGroupIds', () => {
  const params = buildProductListQueryParams({
    search: 'розы',
    promotionalOnly: true,
    bestsellerGroupIds: ['g1', 'g2'],
    page: 2,
    pageSize: 25,
  });
  assert.equal(params.search, 'розы');
  assert.equal(params.promotionalOnly, true);
  assert.deepEqual(params.bestsellerGroupIds, ['g1', 'g2']);
  assert.equal('q' in params && params.q !== undefined, false);
  assert.equal(params.promotion, undefined);
  assert.equal(params.bestsellerGroupId, undefined);

  const url = withQuery(adminEndpoints.products, params);
  assert.match(url, /search=/);
  assert.match(url, /promotionalOnly=true/);
  assert.match(url, /bestsellerGroupIds=g1%2Cg2/);
  assert.doesNotMatch(url, /[?&]q=/);
  assert.doesNotMatch(url, /[?&]promotion=/);
  assert.doesNotMatch(url, /bestsellerGroupId=/);
});

test('product list query omits promotionalOnly unless true', () => {
  const params = buildProductListQueryParams({ promotionalOnly: false, search: '' });
  assert.equal(params.promotionalOnly, undefined);
  const url = withQuery(adminEndpoints.products, params);
  assert.doesNotMatch(url, /promotionalOnly=/);
});

test('withQuery joins string arrays for Nest toStringList', () => {
  const url = withQuery('/api/v1/admin/catalog/products', {
    bestsellerGroupIds: ['aaa', 'bbb'],
  });
  assert.equal(url, '/api/v1/admin/catalog/products?bestsellerGroupIds=aaa%2Cbbb');
});

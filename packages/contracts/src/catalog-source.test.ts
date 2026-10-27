import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogSourceDefaultViewAllHref,
  inferCatalogSourceFromSlug,
  resolveCatalogSourceSlug,
} from './catalog-source';

describe('catalog source', () => {
  it('infers promotions and auto defaults', () => {
    assert.deepEqual(inferCatalogSourceFromSlug(null, 'promotions'), {
      kind: 'promotions',
      id: null,
      slug: null,
    });
    assert.deepEqual(inferCatalogSourceFromSlug(null, 'popular'), {
      kind: 'auto',
      id: null,
      slug: null,
    });
    assert.equal(
      inferCatalogSourceFromSlug('bouquets', 'popular').kind,
      'catalog_page',
    );
  });

  it('resolves slug from id map and builds auto view-all href', () => {
    const source = { kind: 'catalog_page' as const, id: 'p1', slug: 'old' };
    assert.equal(
      resolveCatalogSourceSlug(source, 'old', { slugById: { p1: 'roses' } }),
      'roses',
    );
    assert.equal(
      catalogSourceDefaultViewAllHref({ kind: 'catalog_page', slug: 'bouquets' }),
      '/catalog/bouquets',
    );
    assert.equal(
      catalogSourceDefaultViewAllHref({ kind: 'promotions' }),
      '/akcii',
    );
    assert.equal(
      catalogSourceDefaultViewAllHref({
        kind: 'bestseller_group',
        slug: 'hit',
      }),
      '/catalog/bouquets?bestseller=hit',
    );
  });
});

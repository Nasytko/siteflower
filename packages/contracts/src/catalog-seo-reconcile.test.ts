import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  reconcileCatalogSeoLegacy,
  type CatalogCategoryPageSnapshot,
  type CatalogSeoLegacySnapshot,
} from './catalog-seo-reconcile';

function legacy(partial: Partial<CatalogSeoLegacySnapshot> & Pick<CatalogSeoLegacySnapshot, 'id' | 'slug'>): CatalogSeoLegacySnapshot {
  return {
    title: 'Букеты с розами',
    h1: 'Букеты с розами',
    body: null,
    seoTitle: 'SEO',
    seoDescription: 'Desc',
    noIndex: false,
    status: 'PUBLISHED',
    navVisible: true,
    sortOrder: 10,
    rules: { productKinds: ['BOUQUET'], containsFlowerType: 'roza' },
    pinnedProductIds: [],
    excludedProductIds: [],
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

function category(
  partial: Partial<CatalogCategoryPageSnapshot> & Pick<CatalogCategoryPageSnapshot, 'id' | 'slug'>,
): CatalogCategoryPageSnapshot {
  return {
    name: 'Букеты с розами',
    h1: 'Букеты с розами',
    body: null,
    seoTitle: 'SEO',
    seoDescription: 'Desc',
    noIndex: false,
    pageKind: 'THEMATIC',
    pageStatus: 'PUBLISHED',
    navVisible: true,
    sortOrder: 10,
    rules: { productKinds: ['BOUQUET'], containsFlowerType: 'roza' },
    pinnedProductIds: [],
    excludedProductIds: [],
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

test('reconcile: matching slug pair is clean', () => {
  const report = reconcileCatalogSeoLegacy({
    legacy: [legacy({ id: 'l1', slug: 'bukety-s-rozami' })],
    categories: [category({ id: 'c1', slug: 'bukety-s-rozami' })],
    now: '2026-11-01T00:00:00.000Z',
  });
  assert.equal(report.matchedBySlug, 1);
  assert.equal(report.blockedForLegacyDrop, false);
  assert.equal(report.issues.filter((i) => i.severity !== 'INFO').length, 0);
});

test('reconcile: published legacy without category is CRITICAL', () => {
  const report = reconcileCatalogSeoLegacy({
    legacy: [legacy({ id: 'l1', slug: 'orphan', status: 'PUBLISHED' })],
    categories: [],
  });
  assert.ok(report.issues.some((i) => i.code === 'SLUG_ONLY_ON_LEGACY' && i.severity === 'CRITICAL'));
  assert.equal(report.blockedForLegacyDrop, true);
});

test('reconcile: rules and status mismatches', () => {
  const report = reconcileCatalogSeoLegacy({
    legacy: [
      legacy({
        id: 'l1',
        slug: 'x',
        status: 'PUBLISHED',
        rules: { productKinds: ['BOUQUET'] },
        updatedAt: '2026-10-20T00:00:00.000Z',
      }),
    ],
    categories: [
      category({
        id: 'c1',
        slug: 'x',
        pageStatus: 'DRAFT',
        rules: { productKinds: ['STEM'] },
        updatedAt: '2026-10-01T00:00:00.000Z',
      }),
    ],
  });
  assert.ok(report.issues.some((i) => i.code === 'RULES_MISMATCH'));
  assert.ok(report.issues.some((i) => i.code === 'STATUS_MISMATCH'));
  assert.ok(report.issues.some((i) => i.code === 'LEGACY_NEWER_THAN_CATEGORY'));
  assert.equal(report.blockedForLegacyDrop, true);
});

test('reconcile: pin/exclude set mismatches are WARNING', () => {
  const report = reconcileCatalogSeoLegacy({
    legacy: [
      legacy({
        id: 'l1',
        slug: 'x',
        pinnedProductIds: ['p2', 'p1'],
        excludedProductIds: ['e1'],
      }),
    ],
    categories: [
      category({
        id: 'c1',
        slug: 'x',
        pinnedProductIds: ['p1'],
        excludedProductIds: [],
      }),
    ],
  });
  assert.ok(report.issues.some((i) => i.code === 'PIN_SET_MISMATCH' && i.severity === 'WARNING'));
  assert.ok(report.issues.some((i) => i.code === 'EXCLUDE_SET_MISMATCH'));
});

test('reconcile: category-only thematic is INFO', () => {
  const report = reconcileCatalogSeoLegacy({
    legacy: [],
    categories: [category({ id: 'c1', slug: 'new-page' })],
  });
  assert.ok(report.issues.some((i) => i.code === 'SLUG_ONLY_ON_CATEGORY' && i.severity === 'INFO'));
  assert.equal(report.blockedForLegacyDrop, false);
});

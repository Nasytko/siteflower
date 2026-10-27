import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildTaxonomySlugIndex,
  FLOWER_TYPE_SLUG_ALIASES,
  migrateCatalogPageRulesJson,
  parseCatalogPageRules,
  resolveCatalogPageRules,
  resolveTaxonomySlug,
} from './catalog-page-rules';

const ROZA_ID = 'b1000000-0000-4000-8000-000000000001';
const KUSTOVAYA_ID = 'f1000000-0000-4000-8000-000000000001';

const lookup = {
  flowerTypes: buildTaxonomySlugIndex([{ id: ROZA_ID, slug: 'roza' }]),
  flowerForms: buildTaxonomySlugIndex([{ id: KUSTOVAYA_ID, slug: 'kustovaya' }]),
  flowerVarieties: buildTaxonomySlugIndex([]),
  colors: buildTaxonomySlugIndex([]),
  occasions: buildTaxonomySlugIndex([]),
  recipients: buildTaxonomySlugIndex([]),
  flowerTypeAliases: FLOWER_TYPE_SLUG_ALIASES,
};

test('resolveTaxonomySlug: rozy alias maps to roza id', () => {
  const result = resolveTaxonomySlug('rozy', lookup.flowerTypes, FLOWER_TYPE_SLUG_ALIASES);
  assert.deepEqual(result.ids, [ROZA_ID]);
  assert.equal(result.canonicalSlug, 'roza');
  assert.equal(result.diagnostic, undefined);
});

test('resolveTaxonomySlug: plural page slugs map to dictionary FlowerType', () => {
  const types = buildTaxonomySlugIndex([
    { id: ROZA_ID, slug: 'roza' },
    { id: 'ft-chrys', slug: 'hrizantema' },
    { id: 'ft-gerb', slug: 'gerbera' },
    { id: 'ft-tul', slug: 'tyulpan' },
    { id: 'ft-lil', slug: 'liliya' },
  ]);
  assert.deepEqual(
    resolveTaxonomySlug('hrizantemy', types, FLOWER_TYPE_SLUG_ALIASES).ids,
    ['ft-chrys'],
  );
  assert.deepEqual(
    resolveTaxonomySlug('gerbery', types, FLOWER_TYPE_SLUG_ALIASES).ids,
    ['ft-gerb'],
  );
  assert.deepEqual(
    resolveTaxonomySlug('tyulpany', types, FLOWER_TYPE_SLUG_ALIASES).ids,
    ['ft-tul'],
  );
  assert.deepEqual(
    resolveTaxonomySlug('lilii', types, FLOWER_TYPE_SLUG_ALIASES).ids,
    ['ft-lil'],
  );
});

test('resolveTaxonomySlug: unknown slug is unresolved (fail closed)', () => {
  const result = resolveTaxonomySlug('unknown-flower', lookup.flowerTypes, FLOWER_TYPE_SLUG_ALIASES);
  assert.deepEqual(result.ids, []);
  assert.equal(result.diagnostic?.code, 'UNRESOLVED_SLUG');
});

test('resolveTaxonomySlug: ambiguous slug does not pick randomly', () => {
  const ambiguous = buildTaxonomySlugIndex([
    { id: 'a', slug: 'dup' },
    { id: 'b', slug: 'dup' },
  ]);
  const result = resolveTaxonomySlug('dup', ambiguous);
  assert.deepEqual(result.ids, []);
  assert.equal(result.diagnostic?.code, 'AMBIGUOUS_SLUG');
});

test('resolveCatalogPageRules: page slug rozy becomes flowerTypeIds for STEM', () => {
  const { filters, blocking, diagnostics } = resolveCatalogPageRules(
    { productKinds: ['STEM'], flowerTypeSlugs: ['rozy'] },
    lookup,
  );
  assert.equal(blocking, false);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(filters.productKinds, ['STEM']);
  assert.deepEqual(filters.flowerTypeIds, [ROZA_ID]);
  assert.equal(filters.flowerTypeSlugs, undefined);
});

test('resolveCatalogPageRules: onlyFlowerType roza → onlyFlowerTypeIds', () => {
  const { filters, blocking } = resolveCatalogPageRules(
    { productKinds: ['BOUQUET'], onlyFlowerType: 'roza' },
    lookup,
  );
  assert.equal(blocking, false);
  assert.deepEqual(filters.onlyFlowerTypeIds, [ROZA_ID]);
  assert.equal(filters.flowerTypeIds, undefined);
});

test('resolveCatalogPageRules: kustovaya form + roza type', () => {
  const { filters, blocking } = resolveCatalogPageRules(
    {
      productKinds: ['STEM', 'BOUQUET'],
      flowerTypeSlugs: ['roza'],
      flowerFormSlugs: ['kustovaya'],
    },
    lookup,
  );
  assert.equal(blocking, false);
  assert.deepEqual(filters.flowerTypeIds, [ROZA_ID]);
  assert.deepEqual(filters.flowerFormIds, [KUSTOVAYA_ID]);
});

test('resolveCatalogPageRules: unresolved slug blocks without expanding', () => {
  const { filters, blocking, diagnostics } = resolveCatalogPageRules(
    { productKinds: ['STEM'], flowerTypeSlugs: ['not-a-type'] },
    lookup,
  );
  assert.equal(blocking, true);
  assert.equal(filters.flowerTypeIds, undefined);
  assert.ok(diagnostics.some((d) => d.code === 'UNRESOLVED_SLUG'));
});

test('parseCatalogPageRules keeps slug passthrough for dual-read', () => {
  const filters = parseCatalogPageRules({
    containsFlowerType: 'roza',
    compositionType: 'MIXED',
    productKinds: ['BOUQUET'],
  });
  assert.deepEqual(filters.flowerTypeSlugs, ['roza']);
  assert.deepEqual(filters.compositionKinds, ['MIXED']);
});

test('migrateCatalogPageRulesJson adds ids and keeps slugs', () => {
  const { next, changed, diagnostics } = migrateCatalogPageRulesJson(
    { productKinds: ['STEM'], flowerTypeSlugs: ['rozy'] },
    lookup,
  );
  assert.equal(changed, true);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(next.flowerTypeIds, [ROZA_ID]);
  assert.deepEqual(next.flowerTypeSlugs, ['rozy']);
  assert.deepEqual(next.productKinds, ['STEM']);
});

test('migrateCatalogPageRulesJson skips unknown slug without inventing ids', () => {
  const { next, changed, diagnostics } = migrateCatalogPageRulesJson(
    { flowerTypeSlugs: ['mystery'] },
    lookup,
  );
  assert.equal(changed, false);
  assert.equal(next.flowerTypeIds, undefined);
  assert.ok(diagnostics.some((d) => d.code === 'UNRESOLVED_SLUG'));
});

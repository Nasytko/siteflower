import {
  buildTaxonomySlugIndex,
  FLOWER_TYPE_SLUG_ALIASES,
  migrateCatalogPageRulesJson,
  resolveCatalogPageRules,
} from '@bouquet-one/contracts';

const ROZA_ID = 'b1000000-0000-4000-8000-000000000001';

const lookup = {
  flowerTypes: buildTaxonomySlugIndex([
    { id: ROZA_ID, slug: 'roza' },
    { id: 'b1000000-0000-4000-8000-000000000002', slug: 'hrizantema' },
  ]),
  flowerForms: buildTaxonomySlugIndex([]),
  flowerVarieties: buildTaxonomySlugIndex([]),
  colors: buildTaxonomySlugIndex([]),
  occasions: buildTaxonomySlugIndex([]),
  recipients: buildTaxonomySlugIndex([]),
  flowerTypeAliases: FLOWER_TYPE_SLUG_ALIASES,
};

describe('Catalog rules data migration (remappable)', () => {
  it('enriches STEM leaf rules that used category slug rozy', () => {
    const first = migrateCatalogPageRulesJson(
      { productKinds: ['STEM'], flowerTypeSlugs: ['rozy'] },
      lookup,
    );
    expect(first.changed).toBe(true);
    expect(first.next.flowerTypeIds).toEqual([ROZA_ID]);
    expect(first.next.flowerTypeSlugs).toEqual(['rozy']);

    // Second run is a no-op (idempotent).
    const second = migrateCatalogPageRulesJson(first.next, lookup);
    expect(second.changed).toBe(false);
    expect(second.next.flowerTypeIds).toEqual([ROZA_ID]);
  });

  it('does not invent ids for unknown tokens; keeps user rules', () => {
    const rules = {
      productKinds: ['BOUQUET'],
      flowerTypeSlugs: ['custom-legacy-token'],
      compositionKinds: ['MIXED'],
    };
    const { next, changed, diagnostics } = migrateCatalogPageRulesJson(rules, lookup);
    expect(changed).toBe(false);
    expect(next).toEqual(rules);
    expect(diagnostics.some((d) => d.code === 'UNRESOLVED_SLUG')).toBe(true);
  });

  it('runtime resolve matches migrated ids for rozy and canonical roza', () => {
    const migrated = migrateCatalogPageRulesJson(
      { productKinds: ['STEM'], flowerTypeSlugs: ['rozy'] },
      lookup,
    ).next;
    const fromMigrated = resolveCatalogPageRules(migrated, lookup);
    const fromCanonical = resolveCatalogPageRules(
      { productKinds: ['STEM'], flowerTypeSlugs: ['roza'] },
      lookup,
    );
    expect(fromMigrated.blocking).toBe(false);
    expect(fromCanonical.blocking).toBe(false);
    expect(fromMigrated.filters.flowerTypeIds).toEqual(
      fromCanonical.filters.flowerTypeIds,
    );
    expect(fromMigrated.filters.flowerTypeIds).toEqual([ROZA_ID]);
  });

  it('preserves onlyFlowerType / contains aliases alongside new ids', () => {
    const only = migrateCatalogPageRulesJson(
      { productKinds: ['BOUQUET'], onlyFlowerType: 'roza' },
      lookup,
    );
    expect(only.next.onlyFlowerTypeIds).toEqual([ROZA_ID]);
    expect(only.next.onlyFlowerType).toBe('roza');

    const contains = migrateCatalogPageRulesJson(
      { productKinds: ['BOUQUET'], containsFlowerType: 'roza' },
      lookup,
    );
    expect(contains.next.flowerTypeIds).toEqual([ROZA_ID]);
    expect(contains.next.containsFlowerType).toBe('roza');
  });
});

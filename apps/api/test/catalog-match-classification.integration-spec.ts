/**
 * Classification integration against real PostgreSQL.
 * Focus: slug alias rozy→roza, ID-first rules, no invented ids.
 * Requires DATABASE_URL (default localhost:5433). Never use production.
 */
import pg from 'pg';
import {
  buildTaxonomySlugIndex,
  FLOWER_TYPE_SLUG_ALIASES,
  migrateCatalogPageRulesJson,
  resolveCatalogPageRules,
} from '@bouquet-one/contracts';

import { randomUUID } from 'node:crypto';
import { resolveIntegrationDatabaseUrl } from './integration-database-url';

describe('Catalog match classification (integration)', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    const databaseUrl = await resolveIntegrationDatabaseUrl();
    pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      throw new Error(
        `Integration tests require PostgreSQL at DATABASE_URL. ${(err as Error).message}`,
      );
    }
    // Ensure canonical rose type exists (other suites may wipe flower_types).
    const existing = await pool.query(`SELECT 1 FROM flower_types WHERE slug = 'roza' LIMIT 1`);
    if (existing.rowCount === 0) {
      await pool.query(
        `INSERT INTO flower_types (id, slug, name, sort_order, visibility, version, no_index, created_at, updated_at)
         VALUES ($1, 'roza', 'Роза', 10, 'VISIBLE', 1, false, NOW(), NOW())`,
        [randomUUID()],
      );
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  async function loadLookup() {
    const types = await pool.query<{ id: string; slug: string }>(
      'SELECT id::text AS id, slug FROM flower_types',
    );
    const forms = await pool.query<{ id: string; slug: string }>(
      'SELECT id::text AS id, slug FROM flower_forms',
    );
    return {
      flowerTypes: buildTaxonomySlugIndex(types.rows),
      flowerForms: buildTaxonomySlugIndex(forms.rows),
      flowerVarieties: buildTaxonomySlugIndex([]),
      colors: buildTaxonomySlugIndex([]),
      occasions: buildTaxonomySlugIndex([]),
      recipients: buildTaxonomySlugIndex([]),
      flowerTypeAliases: FLOWER_TYPE_SLUG_ALIASES,
      typeRows: types.rows,
    };
  }

  it('maps /katalog/rozy page rules to FlowerType roza id', async () => {
    const lookup = await loadLookup();
    const roza = lookup.typeRows.find((t) => t.slug === 'roza');
    expect(roza).toBeTruthy();

    const resolved = resolveCatalogPageRules(
      { productKinds: ['STEM'], flowerTypeSlugs: ['rozy'] },
      lookup,
    );
    expect(resolved.blocking).toBe(false);
    expect(resolved.filters.flowerTypeIds).toEqual([roza!.id]);
    expect(resolved.filters.flowerTypeSlugs).toBeUndefined();
  });

  it('resolves every FlowerType.slug uniquely for STEM leaf rules', async () => {
    const lookup = await loadLookup();
    for (const type of lookup.typeRows) {
      const resolved = resolveCatalogPageRules(
        { productKinds: ['STEM'], flowerTypeSlugs: [type.slug] },
        lookup,
      );
      expect(resolved.blocking).toBe(false);
      expect(resolved.filters.flowerTypeIds).toEqual([type.id]);
    }
  });

  it('mono-from-type uses onlyFlowerTypeIds; contains does not force MONO', async () => {
    const lookup = await loadLookup();
    const roza = lookup.typeRows.find((t) => t.slug === 'roza')!;
    const only = resolveCatalogPageRules(
      { productKinds: ['BOUQUET'], onlyFlowerType: 'roza' },
      lookup,
    );
    expect(only.filters.onlyFlowerTypeIds).toEqual([roza.id]);
    expect(only.filters.flowerTypeIds).toBeUndefined();

    const contains = resolveCatalogPageRules(
      { productKinds: ['BOUQUET'], containsFlowerType: 'roza' },
      lookup,
    );
    expect(contains.filters.flowerTypeIds).toEqual([roza.id]);
    expect(contains.filters.onlyFlowerTypeIds).toBeUndefined();
    expect(contains.filters.compositionKinds).toBeUndefined();
  });

  it('migration enrich is idempotent on catalog_categories.rules JSON', async () => {
    const lookup = await loadLookup();
    const sample = await pool.query<{ id: string; slug: string; rules: unknown }>(
      `SELECT id::text AS id, slug, rules
       FROM catalog_categories
       WHERE rules IS NOT NULL
         AND jsonb_typeof(rules) = 'object'
       LIMIT 20`,
    );
    for (const row of sample.rows) {
      const first = migrateCatalogPageRulesJson(row.rules, lookup);
      const second = migrateCatalogPageRulesJson(first.next, lookup);
      expect(second.changed).toBe(false);
      if (first.changed && first.next.flowerTypeIds) {
        expect(Array.isArray(first.next.flowerTypeIds)).toBe(true);
      }
    }
  });

  it('unknown slug stays unresolved (fail closed) — no random expansion', async () => {
    const lookup = await loadLookup();
    const resolved = resolveCatalogPageRules(
      { productKinds: ['STEM'], flowerTypeSlugs: ['__not-a-real-type__'] },
      lookup,
    );
    expect(resolved.blocking).toBe(true);
    expect(resolved.filters.flowerTypeIds).toBeUndefined();
  });
});

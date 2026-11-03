/**
 * Static expand ↔ Prisma ↔ repository compatibility (no live PostgreSQL).
 * Guards the deploy window: expand → new app → classify → deferred contract.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('expand migration ProductComponent write-compat', () => {
  const expandSql = read(
    'packages/database/prisma/migrations/20261102220000_flower_type_composition_class/migration.sql',
  );
  const catalogDomainSql = read(
    'packages/database/prisma/migrations/20260920190000_catalog_domain/migration.sql',
  );
  const roleSql = read(
    'packages/database/prisma/migrations/20261018180000_composition_role_color_seo_landing/migration.sql',
  );
  const schema = read('packages/database/prisma/schema.prisma');
  const repository = read('apps/api/src/catalog/products.repository.ts');
  const seed = read('apps/api/scripts/seed-dev-catalog.ts');
  const deferredContract = read(
    'packages/database/prisma/deferred/20261102230000_simplify_product_composition_contract.sql',
  );

  it('historical product_components: display_name NOT NULL, quantity nullable, unit DEFAULT', () => {
    expect(catalogDomainSql).toMatch(/"display_name"\s+VARCHAR\(160\)\s+NOT NULL/);
    expect(catalogDomainSql).toMatch(/"quantity"\s+INTEGER,/);
    expect(catalogDomainSql).not.toMatch(/"quantity"\s+INTEGER\s+NOT NULL/);
    expect(catalogDomainSql).toMatch(
      /"unit"\s+"ComponentUnit"\s+NOT NULL\s+DEFAULT\s+'UNSPECIFIED'/,
    );
  });

  it('historical product_components: role NOT NULL DEFAULT PRIMARY; color_id nullable', () => {
    expect(roleSql).toMatch(
      /ADD COLUMN IF NOT EXISTS "role"\s+"ComponentRole"\s+NOT NULL\s+DEFAULT\s+'PRIMARY'/,
    );
    expect(roleSql).toMatch(/ADD COLUMN IF NOT EXISTS "color_id"\s+UUID,/);
  });

  it('expand softens display_name with DEFAULT empty string (rollback-safe) and reaffirms unit/role defaults', () => {
    expect(expandSql).toMatch(/ALTER COLUMN "display_name"\s+SET DEFAULT ''/);
    expect(expandSql).toMatch(/ALTER COLUMN "display_name"\s+DROP NOT NULL/);
    expect(expandSql).toMatch(/ALTER COLUMN "unit"\s+SET DEFAULT 'UNSPECIFIED'/);
    expect(expandSql).toMatch(/ALTER COLUMN "role"\s+SET DEFAULT 'PRIMARY'/);
  });

  it('expand is additive: no DROP COLUMN / DROP TYPE of composition legacy', () => {
    // Strip SQL line comments so prose mentioning DROP COLUMN does not false-positive.
    const executable = expandSql
      .split('\n')
      .filter((line) => !/^\s*--/.test(line))
      .join('\n');
    expect(executable).not.toMatch(/DROP\s+COLUMN/i);
    expect(executable).not.toMatch(/DROP\s+TYPE/i);
    expect(executable).toMatch(/ADD COLUMN "composition_class"/);
    // Soften nullability is allowed (not a column drop).
    expect(executable).toMatch(/ALTER COLUMN "display_name"\s+DROP NOT NULL/);
  });

  it('Prisma ProductComponent target model omits legacy columns (contract shape)', () => {
    const block = schema.match(/model ProductComponent \{[\s\S]*?@@map\("product_components"\)/)?.[0];
    expect(block).toBeTruthy();
    expect(block).toContain('flowerItemId');
    expect(block).toContain('sortOrder');
    expect(block).not.toMatch(/\bdisplayName\b/);
    expect(block).not.toMatch(/\bquantity\b/);
    expect(block).not.toMatch(/\brole\b/);
    expect(block).not.toMatch(/\bunit\b/);
    expect(block).not.toMatch(/\bcolorId\b/);
  });

  it('Prisma FlowerType includes nullable compositionClass; Product keeps compositionKind cache', () => {
    expect(schema).toMatch(/compositionClass\s+FlowerTypeCompositionClass\?/);
    expect(schema).toMatch(/compositionKind\s+CompositionKind/);
    expect(schema).not.toMatch(/compositionPrecision/);
    expect(schema).not.toMatch(/compositionPrimaryComplete/);
    expect(schema).not.toMatch(/compositionText/);
  });

  it('replaceComponents / seed createMany write only productId+flowerItemId+sortOrder', () => {
    const replace = repository.match(
      /async replaceComponents\([\s\S]*?^\s{2}\}/m,
    )?.[0];
    expect(replace).toBeTruthy();
    expect(replace).toContain('productComponent.createMany');
    expect(replace).toContain('flowerItemId: component.flowerItemId');
    expect(replace).toContain('sortOrder: component.sortOrder');
    expect(replace).not.toMatch(/displayName/);
    expect(replace).not.toMatch(/quantity/);
    expect(replace).not.toMatch(/\brole\b/);
    expect(replace).not.toMatch(/\bunit\b/);

    expect(seed).toContain('productComponent.createMany');
    expect(seed).toMatch(/flowerItemId,/);
    expect(seed).not.toMatch(/displayName:/);
  });

  it('deferred contract (not migrate deploy) drops legacy columns; expand must run first', () => {
    expect(deferredContract).toMatch(/DROP COLUMN IF EXISTS "display_name"/);
    expect(deferredContract).toMatch(/DROP COLUMN IF EXISTS "quantity"/);
    expect(deferredContract).toMatch(/DROP COLUMN IF EXISTS "role"/);
    expect(deferredContract).toMatch(/DROP COLUMN IF EXISTS "unit"/);
    expect(deferredContract).toMatch(/DROP COLUMN IF EXISTS "color_id"/);
    expect(deferredContract).toMatch(/20261102220000_flower_type_composition_class/);
    const deferredInMigrations = fs.existsSync(
      path.join(
        repoRoot,
        'packages/database/prisma/migrations/20261102230000_simplify_product_composition_contract',
      ),
    );
    expect(deferredInMigrations).toBe(false);
  });

  it('documents deploy order constraint: new app needs expand before createMany', () => {
    // Without DEFAULT/DROP NOT NULL on display_name, omit-column INSERT fails on old NOT NULL.
    expect(expandSql).toMatch(/display_name/);
    expect(expandSql).toMatch(/composition_class/);
  });
});

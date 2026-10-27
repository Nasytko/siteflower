/**
 * Rewrite NavigationMenu CUSTOM_URL (and similar) persisted hrefs from legacy
 * /bukety|/katalog|/cvety|/p paths to English canonical routes.
 *
 * Usage:
 *   pnpm --filter @bouquet-one/api exec tsx scripts/migrate-legacy-nav-urls.ts [--apply]
 * Default is dry-run.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { migrateLegacyInternalHref } from '@bouquet-one/contracts';
import { createPrismaClient } from '@bouquet-one/database';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const apply = process.argv.includes('--apply');
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://bouquet:bouquet_dev_password@127.0.0.1:5432/bouquet_one?schema=public';
  const prisma = await createPrismaClient({ connectionString });

  const rows = await prisma.navigationMenuItem.findMany({
    where: {
      OR: [
        { targetType: 'CUSTOM_URL' },
        { customHref: { not: null } },
      ],
    },
    select: { id: true, label: true, targetType: true, customHref: true },
  });

  let changed = 0;
  for (const row of rows) {
    const href = row.customHref?.trim();
    if (!href) continue;
    // PAGE keys (bukety, cvety) are resolved via navigationPageHref — leave keys alone.
    if (row.targetType === 'PAGE' && !href.startsWith('/')) continue;
    const next = migrateLegacyInternalHref(href);
    if (!next || next === href) continue;
    changed += 1;
    console.log(`${apply ? 'UPDATE' : 'DRY'} ${row.id} (${row.label}): ${href} → ${next}`);
    if (apply) {
      await prisma.navigationMenuItem.update({
        where: { id: row.id },
        data: { customHref: next },
      });
    }
  }

  // Homepage discovery tiles / CTAs stored as JSON may also hold legacy paths.
  const homepage = await prisma.homepageConfig.findUnique({ where: { id: 1 } });
  if (homepage?.config && typeof homepage.config === 'object' && !Array.isArray(homepage.config)) {
    const json = JSON.stringify(homepage.config);
    let rewritten = json;
    for (const [from, to] of [
      ['/bukety/', '/products/'],
      ['"/bukety"', '"/catalog/bouquets"'],
      ["'/bukety'", "'/catalog/bouquets'"],
      ['/katalog/', '/catalog/'],
      ['"/cvety"', '"/catalog/stems"'],
      ["'/cvety'", "'/catalog/stems'"],
      ['"/katalog/', '"/catalog/'],
    ] as const) {
      rewritten = rewritten.split(from).join(to);
    }
    // Recursively migrate string values that are full paths.
    const walk = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return migrateLegacyInternalHref(value) ?? value;
      }
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          out[k] = walk(v);
        }
        return out;
      }
      return value;
    };
    const walked = walk(homepage.config);
    const walkedJson = JSON.stringify(walked);
    if (walkedJson !== json || rewritten !== json) {
      const nextConfig = walkedJson !== json ? walked : JSON.parse(rewritten);
      console.log(
        `${apply ? 'UPDATE' : 'DRY'} homepage_config JSON contains legacy path strings`,
      );
      if (apply) {
        await prisma.homepageConfig.update({
          where: { id: 1 },
          data: { config: nextConfig as object },
        });
      }
      changed += 1;
    }
  }

  console.log(`Done. ${changed} change(s). apply=${apply}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Ensure SlugRedirect rows exist for English catalog slug aliases.
 * Safe to re-run after integration tests wipe slug_redirects.
 *
 *   pnpm --filter @bouquet-one/api exec tsx scripts/ensure-catalog-slug-redirects.ts
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { CATALOG_SLUG_ALIASES } from '@bouquet-one/contracts';
import { createPrismaClient } from '@bouquet-one/database';
import { randomUUID } from 'node:crypto';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://bouquet:bouquet_dev_password@127.0.0.1:5432/bouquet_one?schema=public';
  const prisma = await createPrismaClient({ connectionString });

  let inserted = 0;
  for (const [fromSlug, toSlug] of Object.entries(CATALOG_SLUG_ALIASES)) {
    const target = await prisma.catalogCategory.findUnique({ where: { slug: toSlug } });
    if (!target) continue;
    const existing = await prisma.slugRedirect.findUnique({
      where: { entityType_fromSlug: { entityType: 'CATALOG_CATEGORY', fromSlug } },
    });
    if (existing) {
      if (existing.toSlug !== toSlug) {
        await prisma.slugRedirect.update({
          where: { entityType_fromSlug: { entityType: 'CATALOG_CATEGORY', fromSlug } },
          data: { toSlug },
        });
        console.log(`fix ${fromSlug} → ${toSlug}`);
      }
      continue;
    }
    await prisma.slugRedirect.create({
      data: {
        id: randomUUID(),
        entityType: 'CATALOG_CATEGORY',
        fromSlug,
        toSlug,
      },
    });
    inserted += 1;
    console.log(`INSERT ${fromSlug} → ${toSlug}`);
  }
  console.log(`Inserted ${inserted} redirect(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Safe, remappable enrichment of CatalogCategory.rules / SeoLandingPage.rules
 * with stable taxonomy *Ids. Does not touch products or orders.
 *
 * Usage:
 *   pnpm --filter @bouquet-one/api exec tsx scripts/migrate-catalog-page-rules.ts
 *   pnpm --filter @bouquet-one/api exec tsx scripts/migrate-catalog-page-rules.ts --apply
 *
 * Default is dry-run (report only). Never run against production without review.
 */
import {
  buildTaxonomySlugIndex,
  FLOWER_TYPE_SLUG_ALIASES,
  migrateCatalogPageRulesJson,
  type CatalogTaxonomyLookup,
} from '@bouquet-one/contracts';
import { createPrismaClient } from '@bouquet-one/database';

const APPLY = process.argv.includes('--apply');

async function main() {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://bouquet:bouquet_dev_password@127.0.0.1:5433/bouquet_one?schema=public';
  const prisma = await createPrismaClient({ connectionString });
  try {
    const [flowerTypes, flowerForms, flowerVarieties, colors, occasions, recipients] =
      await Promise.all([
        prisma.flowerType.findMany({ select: { id: true, slug: true } }),
        prisma.flowerForm.findMany({ select: { id: true, slug: true } }),
        prisma.flowerVariety.findMany({ select: { id: true, slug: true } }),
        prisma.color.findMany({ select: { id: true, slug: true } }),
        prisma.occasion.findMany({ select: { id: true, slug: true } }),
        prisma.recipient.findMany({ select: { id: true, slug: true } }),
      ]);

    const lookup: CatalogTaxonomyLookup = {
      flowerTypes: buildTaxonomySlugIndex(flowerTypes),
      flowerForms: buildTaxonomySlugIndex(flowerForms),
      flowerVarieties: buildTaxonomySlugIndex(flowerVarieties),
      colors: buildTaxonomySlugIndex(colors),
      occasions: buildTaxonomySlugIndex(occasions),
      recipients: buildTaxonomySlugIndex(recipients),
      flowerTypeAliases: FLOWER_TYPE_SLUG_ALIASES,
    };

    const categories = (
      await prisma.catalogCategory.findMany({
        select: { id: true, slug: true, rules: true },
      })
    ).filter((row) => row.rules != null);
    const landings = await prisma.seoLandingPage.findMany({
      select: { id: true, slug: true, rules: true },
    });

    let wouldChange = 0;
    let applied = 0;
    const reports: string[] = [];

    for (const row of categories) {
      const { next, changed, diagnostics } = migrateCatalogPageRulesJson(row.rules, lookup);
      if (!changed && diagnostics.length === 0) continue;
      if (changed) wouldChange += 1;
      const line = [
        `category:${row.slug}`,
        changed ? 'ENRICH' : 'SKIP',
        diagnostics.map((d) => `${d.code}:${d.value}`).join(',') || 'ok',
      ].join(' | ');
      reports.push(line);
      if (APPLY && changed) {
        await prisma.catalogCategory.update({
          where: { id: row.id },
          data: { rules: next },
        });
        applied += 1;
      }
    }

    for (const row of landings) {
      const { next, changed, diagnostics } = migrateCatalogPageRulesJson(row.rules, lookup);
      if (!changed && diagnostics.length === 0) continue;
      if (changed) wouldChange += 1;
      reports.push(
        [
          `seo:${row.slug}`,
          changed ? 'ENRICH' : 'SKIP',
          diagnostics.map((d) => `${d.code}:${d.value}`).join(',') || 'ok',
        ].join(' | '),
      );
      if (APPLY && changed) {
        await prisma.seoLandingPage.update({
          where: { id: row.id },
          data: { rules: next },
        });
        applied += 1;
      }
    }

    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Rows with enrichable rules: ${wouldChange}`);
    if (APPLY) console.log(`Updated: ${applied}`);
    for (const line of reports) console.log(line);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

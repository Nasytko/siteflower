/**
 * Read-only media consistency check.
 *
 * Usage:
 *   pnpm media:check
 *   pnpm media:check --probe
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createMediaCliContext } from './media-cli-context';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const ctx = await createMediaCliContext();
  try {
    const report = await ctx.health.runConsistencyCheck({
      probeStorage: hasFlag('--probe'),
      sampleLimit: 200,
    });

    console.log(
      JSON.stringify(
        {
          checkedAt: report.checkedAt,
          driver: report.driver,
          assetCount: report.assetCount,
          referencedAssets: report.referencedAssets,
          orphanCandidates: report.orphanCandidates,
          orphanWithinGrace: report.orphanWithinGrace,
          missingMasters: report.missingMasters.length,
          missingDerivatives: report.missingDerivatives.length,
          productsMissingPrimary: report.productsMissingPrimary.length,
          productsMultiplePrimary: report.productsMultiplePrimary.length,
          storageProbe: report.storageProbe
            ? {
                ok: report.storageProbe.ok,
                writeOk: report.storageProbe.writeOk,
                readOk: report.storageProbe.readOk,
                deleteOk: report.storageProbe.deleteOk,
                latencyMs: report.storageProbe.latencyMs,
                error: report.storageProbe.error,
              }
            : null,
          sampleMissingMasters: report.missingMasters.slice(0, 10),
          sampleMissingDerivatives: report.missingDerivatives.slice(0, 10),
          sampleProductsMissingPrimary: report.productsMissingPrimary.slice(0, 10),
        },
        null,
        2,
      ),
    );

    const hardFail =
      report.missingMasters.length > 0 ||
      report.productsMultiplePrimary.length > 0 ||
      (report.storageProbe != null && !report.storageProbe.ok);
    process.exit(hardFail ? 1 : 0);
  } finally {
    await ctx.close();
  }
}

main().catch((err) => {
  console.error(String((err as Error).message ?? err));
  process.exit(2);
});

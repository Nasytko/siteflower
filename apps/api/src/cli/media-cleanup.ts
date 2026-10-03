/**
 * Orphan media cleanup. Default is dry-run.
 *
 * Usage:
 *   pnpm media:cleanup
 *   pnpm media:cleanup --dry-run
 *   pnpm media:cleanup --execute
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
  const execute = hasFlag('--execute');
  const dryRun = !execute;
  const ctx = await createMediaCliContext();
  try {
    const report = await ctx.orphans.cleanup({ dryRun, limit: 100 });
    console.log(
      JSON.stringify(
        {
          dryRun: report.dryRun,
          graceHours: report.graceHours,
          scanned: report.scanned,
          estimatedReclaimableBytes: report.estimatedReclaimableBytes,
          candidates: report.candidates.map((c) => ({
            id: c.id,
            createdAt: c.createdAt,
            orphanedAt: c.orphanedAt,
            estimatedBytes: c.estimatedBytes,
          })),
          deletedAssets: report.deletedAssets,
          deletedKeysCount: report.deletedKeys.length,
          skippedLocked: report.skippedLocked,
          failures: report.failures,
        },
        null,
        2,
      ),
    );
    if (report.failures.length > 0) process.exit(1);
  } finally {
    await ctx.close();
  }
}

main().catch((err) => {
  console.error(String((err as Error).message ?? err));
  process.exit(2);
});

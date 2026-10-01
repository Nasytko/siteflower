/**
 * Regenerate missing derivatives from normalized master.
 * Default dry-run. Does not fabricate missing masters.
 *
 * Usage:
 *   pnpm media:repair
 *   pnpm media:repair --execute
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
  const ctx = await createMediaCliContext();
  try {
    const report = await ctx.repair.repairMissingDerivatives({
      dryRun: !execute,
      limit: 100,
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.failures.length > 0) {
      process.exit(1);
    }
    // Missing masters are reported but are not repairable without re-upload — not a hard CLI failure.
  } finally {
    await ctx.close();
  }
}

main().catch((err) => {
  console.error(String((err as Error).message ?? err));
  process.exit(2);
});

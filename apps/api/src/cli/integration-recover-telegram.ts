/**
 * Recover Telegram outbox rows missing after ERP DELIVERED (historical gap fill).
 * Default dry-run. Safe to re-run (dedupes in-flight/delivered Telegram).
 *
 * Usage:
 *   pnpm --filter @bouquet-one/api integration:recover-telegram
 *   pnpm --filter @bouquet-one/api integration:recover-telegram -- --execute
 *   pnpm --filter @bouquet-one/api integration:recover-telegram -- --execute --order-id=<uuid>
 *   pnpm --filter @bouquet-one/api integration:recover-telegram -- --limit=50
 *
 * Does not touch production unless --execute is passed on that environment.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from '@bouquet-one/database';
import { recoverMissingTelegramEvents } from '../integration/telegram-recovery';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readOption(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main(): Promise<void> {
  const execute = hasFlag('--execute');
  const orderId = readOption('--order-id');
  const limitRaw = readOption('--limit');
  const limit = limitRaw ? Number(limitRaw) : 100;
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error('--limit must be a positive number');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = await Promise.resolve(createPrismaClient({ connectionString: databaseUrl }));
  try {
    const report = await recoverMissingTelegramEvents(prisma, {
      dryRun: !execute,
      orderId: orderId || undefined,
      limit,
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(String((err as Error).message ?? err));
  process.exit(2);
});

/**
 * Copy local media objects into S3-compatible storage.
 * Does NOT delete local source. Idempotent (skips existing destination keys).
 *
 * Usage:
 *   MEDIA_STORAGE=local ... (source)
 *   Requires S3_* env for destination.
 *   pnpm media:migrate-local-to-s3 --dry-run
 *   pnpm media:migrate-local-to-s3 --execute
 */
import { config } from 'dotenv';
import { resolve, join } from 'node:path';
import { createPrismaClient } from '@bouquet-one/database';
import { LocalMediaStorage } from '../src/media/local-media.storage';
import { S3MediaStorage } from '../src/media/s3-media.storage';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const execute = hasFlag('--execute');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL required');
    process.exit(2);
  }
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    console.error('S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY required');
    process.exit(2);
  }

  const localRoot = join(process.cwd(), process.env.MEDIA_LOCAL_ROOT ?? './storage/media');
  const localPublic = process.env.MEDIA_PUBLIC_BASE_URL ?? 'http://localhost/media';
  const source = new LocalMediaStorage(localRoot, localPublic);
  const dest = new S3MediaStorage({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'auto',
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? localPublic,
  });

  const prisma = await Promise.resolve(createPrismaClient({ connectionString: databaseUrl }));
  const assets = await prisma.mediaAsset.findMany({ include: { derivatives: true } });
  const keys: Array<{ key: string; contentType: string }> = [];
  for (const asset of assets) {
    keys.push({ key: asset.storageKey, contentType: asset.mimeType });
    for (const d of asset.derivatives) {
      const ext = d.format === 'AVIF' ? 'avif' : 'webp';
      keys.push({
        key: d.storageKey,
        contentType: ext === 'avif' ? 'image/avif' : 'image/webp',
      });
    }
  }

  let copied = 0;
  let skipped = 0;
  let missing = 0;
  const failures: Array<{ key: string; error: string }> = [];

  for (const item of keys) {
    try {
      const destHead = await dest.head(item.key);
      if (destHead.exists) {
        skipped += 1;
        continue;
      }
      const body = await source.get(item.key);
      if (!body) {
        missing += 1;
        continue;
      }
      if (execute) {
        await dest.put({
          key: item.key,
          body,
          contentType: item.contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        });
      }
      copied += 1;
    } catch (err) {
      failures.push({ key: item.key, error: (err as Error).message });
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !execute,
        totalKeys: keys.length,
        copied,
        skippedExisting: skipped,
        missingLocal: missing,
        failures,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(String((err as Error).message ?? err));
  process.exit(2);
});

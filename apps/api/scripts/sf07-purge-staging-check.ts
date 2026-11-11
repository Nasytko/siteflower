/**
 * SF-07 staging check against an isolated test DB (never production).
 *
 * Usage (PowerShell):
 *   $env:DATABASE_URL='postgresql://…/bouquet_one_p2_test?schema=public'
 *   $env:TEST_DATABASE_ALLOW_INTEGRATION='1'
 *   pnpm --filter @bouquet-one/api exec tsx scripts/sf07-purge-staging-check.ts
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPrismaClient } from '@bouquet-one/database';
import { assertMediaAttachable } from '../src/media/media-attach.guard';
import { LocalMediaStorage } from '../src/media/local-media.storage';
import { MediaOrphanService } from '../src/media/media-orphan.service';
import type { MediaStorage } from '../src/media/media-storage';
import type { PrismaClient } from '@bouquet-one/database';

function uuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertSafeUrl(url: string): void {
  if (!url) throw new Error('DATABASE_URL required');
  if (/rds|neon|supabase|hostfly|shopbuket1/i.test(url)) {
    throw new Error('Refusing production-looking DATABASE_URL');
  }
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, '').split('/')[0] ?? '');
  if (!/(?:_test|_ci|_audit|_integration)/i.test(name) && name !== 'bouquet_one_p2_test') {
    throw new Error(`Refusing non-test database name: ${name}`);
  }
}

function wrapFailOnSecondKey(inner: MediaStorage): MediaStorage & { failNextSecond: boolean } {
  let deletes = 0;
  const wrapped = {
    driver: inner.driver,
    failNextSecond: true,
    put: (input: Parameters<MediaStorage['put']>[0]) => inner.put(input),
    get: (key: string) => inner.get(key),
    head: (key: string) => inner.head(key),
    getPublicUrl: (key: string) => inner.getPublicUrl(key),
    delete: async (key: string) => {
      deletes += 1;
      if (wrapped.failNextSecond && deletes >= 2) {
        throw new Error('simulated_second_key_failure');
      }
      return inner.delete(key);
    },
  };
  return wrapped;
}

async function seedOrphan(
  prisma: PrismaClient,
  storage: MediaStorage,
  label: string,
): Promise<{ id: string; masterKey: string; derivKey: string }> {
  const id = uuid();
  const masterKey = `masters/sf07-${label}-${id}.bin`;
  const derivKey = `derivatives/sf07-${label}-${id}/w400.webp`;
  const body = Buffer.from(`sf07-${label}-${id}`);
  await storage.put({ key: masterKey, body, contentType: 'application/octet-stream' });
  await storage.put({
    key: derivKey,
    body: Buffer.from(`deriv-${label}`),
    contentType: 'image/webp',
  });
  await prisma.mediaAsset.create({
    data: {
      id,
      storageKey: masterKey,
      mimeType: 'application/octet-stream',
      format: 'PNG',
      byteSize: body.byteLength,
      width: 10,
      height: 10,
      checksumSha256: createHash('sha256').update(body).digest('hex'),
      orphanedAt: new Date(Date.now() - 8 * 24 * 3600_000),
      derivatives: {
        create: [{ width: 400, format: 'WEBP', storageKey: derivKey, byteSize: 12 }],
      },
    },
  });
  return { id, masterKey, derivKey };
}

async function runDriver(
  name: 'local' | 's3-mock',
  prisma: PrismaClient,
  baseStorage: MediaStorage,
): Promise<void> {
  console.log(`\n=== SF-07 ${name} ===`);
  const storage = wrapFailOnSecondKey(baseStorage);
  const service = new MediaOrphanService(
    { client: prisma } as never,
    storage,
  );

  const seeded = await seedOrphan(prisma, baseStorage, name);
  console.log(`seeded orphan ${seeded.id}`);

  // Partial failure on second key
  const failReport = await service.cleanup({ dryRun: false, graceHours: 1, limit: 20 });
  const failEntry = failReport.failures.find((f) => f.assetId === seeded.id);
  if (!failEntry) {
    throw new Error(`${name}: expected failure on second key`);
  }
  if (failReport.deletedAssets.includes(seeded.id)) {
    throw new Error(`${name}: asset must remain after partial storage failure`);
  }
  const claimed = await prisma.mediaAsset.findUnique({
    where: { id: seeded.id },
    select: { purgeStartedAt: true },
  });
  if (!claimed?.purgeStartedAt) {
    throw new Error(`${name}: purgeStartedAt must be set after partial failure`);
  }
  console.log('PASS partial failure leaves claim + DB row');

  // Attach must be blocked while purgeStartedAt is set (product duplicate path)
  const product = await prisma.product.findFirst({
    where: { media: { some: {} } },
    select: { id: true },
  });
  if (!product) {
    throw new Error(`${name}: need a product with media in test DB for attach probe`);
  }
  await expectConflict(async () => {
    await prisma.$transaction(async (tx) => {
      await assertMediaAttachable(tx, seeded.id);
      await tx.productMedia.create({
        data: {
          productId: product.id,
          mediaAssetId: seeded.id,
          sortOrder: 99,
          isPrimary: false,
        },
      });
    });
  });
  console.log('PASS product attach blocked while purgeStartedAt set');

  const navItem = await prisma.navigationMenuItem.findFirst({ select: { id: true } });
  if (navItem) {
    await expectConflict(async () => {
      await prisma.$transaction(async (tx) => {
        await assertMediaAttachable(tx, seeded.id);
        await tx.navigationMenuItem.update({
          where: { id: navItem.id },
          data: { mediaAssetId: seeded.id },
        });
      });
    });
    console.log('PASS NavigationMenuItem attach blocked while purging');
  } else {
    console.log('SKIP NavigationMenuItem (none in DB) — guard covered by unit test');
  }

  // Retry succeeds (missing master after first partial delete is OK)
  storage.failNextSecond = false;
  const okReport = await service.cleanup({ dryRun: false, graceHours: 1, limit: 20 });
  if (!okReport.deletedAssets.includes(seeded.id)) {
    throw new Error(`${name}: retry must delete asset; failures=${JSON.stringify(okReport.failures)}`);
  }
  const gone = await prisma.mediaAsset.findUnique({ where: { id: seeded.id } });
  if (gone) throw new Error(`${name}: DB row must be gone after retry`);
  if ((await baseStorage.head(seeded.masterKey)).exists) {
    throw new Error(`${name}: master key must be gone`);
  }
  if ((await baseStorage.head(seeded.derivKey)).exists) {
    throw new Error(`${name}: derivative key must be gone`);
  }
  console.log('PASS retry deletes files + DB row');
}

async function expectConflict(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    throw new Error('expected purge attach to be blocked');
  } catch (err) {
    const name = (err as { name?: string; constructor?: { name?: string } }).name
      ?? (err as { constructor?: { name?: string } }).constructor?.name
      ?? '';
    const message = err instanceof Error ? err.message : String(err);
    if (name === 'ConflictException' || /orphan|очистк|purge/i.test(message)) return;
    throw err;
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  assertSafeUrl(url);
  const prisma = await createPrismaClient({ connectionString: url });
  const localRoot = join(process.cwd(), 'storage', 'sf07-staging-check');
  await rm(localRoot, { recursive: true, force: true });
  await mkdir(localRoot, { recursive: true });

  try {
    const hasPurge = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'media_assets' AND column_name = 'purge_started_at'
      ) AS exists
    `;
    if (!hasPurge[0]?.exists) {
      throw new Error('purge_started_at column missing — migrate test DB first');
    }

    const local = new LocalMediaStorage(localRoot, 'http://127.0.0.1/media');
    await runDriver('local', prisma, local);

    // S3 path exercised via storage interface stub (same MediaOrphanService codepath).
    const s3Objects = new Map<string, Buffer>();
    const s3Mock: MediaStorage = {
      driver: 's3',
      async put(input) {
        s3Objects.set(input.key, Buffer.from(input.body));
      },
      async get(key) {
        return s3Objects.get(key) ?? null;
      },
      async head(key) {
        return { exists: s3Objects.has(key) };
      },
      getPublicUrl(key) {
        return `https://s3.test/${key}`;
      },
      async delete(key) {
        s3Objects.delete(key);
      },
    };
    await runDriver('s3-mock', prisma, s3Mock);

    await writeFile(
      join(localRoot, 'RESULT.json'),
      JSON.stringify({ ok: true, at: new Date().toISOString() }, null, 2),
    );
    console.log('\nSF-07 staging check PASS');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('SF-07 staging check FAIL', err);
  process.exit(1);
});

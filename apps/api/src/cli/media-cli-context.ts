/**
 * Shared bootstrap for media ops CLIs.
 * Avoids NestFactory + tsx (esbuild strips decorator metadata → DI fails).
 */
import { join } from 'node:path';
import { createPrismaClient, type PrismaClient } from '@bouquet-one/database';
import { LocalMediaStorage } from '../media/local-media.storage';
import { S3MediaStorage } from '../media/s3-media.storage';
import type { MediaStorage } from '../media/media-storage';
import { MediaHealthService, MediaRepairService } from '../media/media-health.service';
import { MediaOrphanService } from '../media/media-orphan.service';

type PrismaServiceLike = { client: PrismaClient };

function createStorage(): MediaStorage {
  const driver = (process.env.MEDIA_STORAGE ?? 'local').toLowerCase();
  if (driver === 's3') {
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY required for MEDIA_STORAGE=s3');
    }
    return new S3MediaStorage({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'auto',
      bucket,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl:
        process.env.S3_PUBLIC_BASE_URL ??
        process.env.MEDIA_PUBLIC_BASE_URL ??
        'http://localhost/media',
      forcePathStyle: !['0', 'false', 'no', 'off'].includes(
        (process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase(),
      ),
    });
  }
  const root = join(process.cwd(), process.env.MEDIA_LOCAL_ROOT ?? './storage/media');
  const publicBase =
    process.env.MEDIA_PUBLIC_BASE_URL ?? 'http://localhost:3001/api/v1/media';
  return new LocalMediaStorage(root, publicBase);
}

export type MediaCliContext = {
  orphans: MediaOrphanService;
  health: MediaHealthService;
  repair: MediaRepairService;
  storage: MediaStorage;
  close: () => Promise<void>;
};

export async function createMediaCliContext(): Promise<MediaCliContext> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL required');
  }
  const client = await createPrismaClient({ connectionString: databaseUrl });
  const prisma = { client } as PrismaServiceLike;
  const storage = createStorage();
  return {
    orphans: new MediaOrphanService(prisma as never, storage),
    health: new MediaHealthService(prisma as never, storage),
    repair: new MediaRepairService(prisma as never, storage),
    storage,
    close: async () => {
      await client.$disconnect();
    },
  };
}

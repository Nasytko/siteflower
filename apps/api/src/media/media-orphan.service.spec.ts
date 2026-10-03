import { MediaOrphanService } from './media-orphan.service';
import type { MediaStorage } from './media-storage';

type OrphanRow = {
  id: string;
  storageKey: string;
  byteSize: number;
  createdAt: Date;
  orphanedAt: Date;
  derivatives: Array<{ storageKey: string; byteSize: number }>;
};

/**
 * Proves purge ordering: storage.delete runs inside the same $transaction that
 * acquired FOR UPDATE, before mediaAsset.delete. This is the lock that blocks
 * concurrent ProductMedia FK inserts (KEY SHARE vs FOR UPDATE).
 */
describe('MediaOrphanService purge transaction ordering', () => {
  it('deletes storage keys under the FOR UPDATE transaction before DB delete', async () => {
    const assetId = '11111111-1111-4111-8111-111111111111';
    const masterKey = `masters/${assetId}.jpg`;
    const derivKey = `derivatives/${assetId}/400.webp`;
    const events: string[] = [];

    const storage: MediaStorage = {
      driver: 'local',
      put: async () => undefined,
      get: async () => null,
      head: async () => ({ exists: false }),
      getPublicUrl: (key) => key,
      delete: async (key) => {
        events.push(`storage.delete:${key}`);
      },
    };

    const tx = {
      $queryRaw: async () => {
        events.push('FOR UPDATE');
        return [{ id: assetId, orphaned_at: new Date('2020-01-01T00:00:00.000Z') }];
      },
      productMedia: {
        count: async () => {
          events.push('ref.count');
          return 0;
        },
      },
      mediaAsset: {
        update: async () => undefined,
        delete: async () => {
          events.push('db.mediaAsset.delete');
        },
      },
      mediaDerivative: {
        deleteMany: async () => {
          events.push('db.mediaDerivative.deleteMany');
        },
      },
    };

    let findManyResult: OrphanRow[] = [];
    const prisma = {
      client: {
        $transaction: async (fn: (txClient: typeof tx) => Promise<void>) => {
          events.push('tx.begin');
          await fn(tx);
          events.push('tx.commit');
        },
        $executeRaw: async () => 0,
        mediaAsset: {
          findMany: async (): Promise<OrphanRow[]> => findManyResult,
        },
      },
    };

    const service = new MediaOrphanService(prisma as never, storage);

    findManyResult = [
      {
        id: assetId,
        storageKey: masterKey,
        byteSize: 10,
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        orphanedAt: new Date('2020-01-01T00:00:00.000Z'),
        derivatives: [{ storageKey: derivKey, byteSize: 4 }],
      },
    ];

    const report = await service.cleanup({ dryRun: false, graceHours: 1, limit: 1 });

    expect(report.failures).toEqual([]);
    expect(report.deletedAssets).toEqual([assetId]);
    expect(report.deletedKeys).toEqual([masterKey, derivKey]);
    expect(events).toEqual([
      'tx.begin',
      'FOR UPDATE',
      'ref.count',
      `storage.delete:${masterKey}`,
      `storage.delete:${derivKey}`,
      'db.mediaDerivative.deleteMany',
      'db.mediaAsset.delete',
      'tx.commit',
    ]);
  });

  it('skips storage delete when a reference appears under FOR UPDATE', async () => {
    const assetId = '22222222-2222-4222-8222-222222222222';
    const events: string[] = [];
    const storage: MediaStorage = {
      driver: 'local',
      put: async () => undefined,
      get: async () => null,
      head: async () => ({ exists: false }),
      getPublicUrl: (key) => key,
      delete: async () => {
        events.push('storage.delete');
      },
    };

    const tx = {
      $queryRaw: async () => [{ id: assetId, orphaned_at: new Date('2020-01-01T00:00:00.000Z') }],
      productMedia: { count: async () => 1 },
      mediaAsset: {
        update: async () => {
          events.push('clear.orphanedAt');
        },
        delete: async () => {
          events.push('db.delete');
        },
      },
      mediaDerivative: { deleteMany: async () => undefined },
    };

    const prisma = {
      client: {
        $transaction: async (fn: (txClient: typeof tx) => Promise<void>) => {
          await fn(tx);
        },
        $executeRaw: async () => 0,
        mediaAsset: {
          findMany: async (): Promise<OrphanRow[]> => [
            {
              id: assetId,
              storageKey: `masters/${assetId}.jpg`,
              byteSize: 1,
              createdAt: new Date('2020-01-01T00:00:00.000Z'),
              orphanedAt: new Date('2020-01-01T00:00:00.000Z'),
              derivatives: [],
            },
          ],
        },
      },
    };

    const service = new MediaOrphanService(prisma as never, storage);
    const report = await service.cleanup({ dryRun: false, graceHours: 1, limit: 1 });

    expect(report.deletedAssets).toEqual([]);
    expect(report.skippedLocked).toContain(assetId);
    expect(events).toEqual(['clear.orphanedAt']);
    expect(events).not.toContain('storage.delete');
  });
});

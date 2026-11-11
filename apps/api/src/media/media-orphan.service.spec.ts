import { MediaOrphanService } from './media-orphan.service';
import type { MediaStorage } from './media-storage';

type OrphanRow = {
  id: string;
  storageKey: string;
  byteSize: number;
  createdAt: Date;
  orphanedAt: Date;
  purgeStartedAt?: Date | null;
  derivatives: Array<{ storageKey: string; byteSize: number }>;
};

describe('MediaOrphanService durable purge', () => {
  it('claims purgeStartedAt before storage delete; records keys only after DB delete', async () => {
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

    let purgeStartedAt: Date | null = null;
    const makeTx = (phase: 'claim' | 'finalize') => ({
      $queryRaw: async () => {
        events.push(`${phase}.FOR UPDATE`);
        return [
          {
            id: assetId,
            orphaned_at: new Date('2020-01-01T00:00:00.000Z'),
            purge_started_at: purgeStartedAt,
          },
        ];
      },
      productMedia: {
        count: async () => {
          events.push(`${phase}.ref.count`);
          return 0;
        },
      },
      navigationMenuItem: {
        count: async () => {
          events.push(`${phase}.nav.ref.count`);
          return 0;
        },
      },
      mediaAsset: {
        update: async (args: { data: { purgeStartedAt?: Date } }) => {
          if (args.data.purgeStartedAt) {
            purgeStartedAt = args.data.purgeStartedAt;
            events.push('claim.purgeStartedAt');
          }
        },
        delete: async () => {
          events.push('db.mediaAsset.delete');
        },
      },
      mediaDerivative: {
        deleteMany: async () => {
          events.push('db.mediaDerivative.deleteMany');
        },
      },
    });

    let txPhase: 'claim' | 'finalize' = 'claim';
    const prisma = {
      client: {
        $transaction: async (fn: (txClient: ReturnType<typeof makeTx>) => Promise<unknown>) => {
          events.push(`tx.${txPhase}.begin`);
          const result = await fn(makeTx(txPhase));
          events.push(`tx.${txPhase}.commit`);
          if (txPhase === 'claim') txPhase = 'finalize';
          return result;
        },
        $executeRaw: async () => 0,
        mediaAsset: {
          findMany: async (): Promise<OrphanRow[]> => [
            {
              id: assetId,
              storageKey: masterKey,
              byteSize: 10,
              createdAt: new Date('2020-01-01T00:00:00.000Z'),
              orphanedAt: new Date('2020-01-01T00:00:00.000Z'),
              purgeStartedAt: null,
              derivatives: [{ storageKey: derivKey, byteSize: 4 }],
            },
          ],
        },
      },
    };

    const service = new MediaOrphanService(prisma as never, storage);
    const report = await service.cleanup({ dryRun: false, graceHours: 1, limit: 1 });

    expect(report.failures).toEqual([]);
    expect(report.deletedAssets).toEqual([assetId]);
    expect(report.deletedKeys).toEqual([masterKey, derivKey]);
    expect(events).toEqual([
      'tx.claim.begin',
      'claim.FOR UPDATE',
      'claim.ref.count',
      'claim.nav.ref.count',
      'claim.purgeStartedAt',
      'tx.claim.commit',
      `storage.delete:${masterKey}`,
      `storage.delete:${derivKey}`,
      'tx.finalize.begin',
      'finalize.FOR UPDATE',
      'finalize.ref.count',
      'finalize.nav.ref.count',
      'db.mediaDerivative.deleteMany',
      'db.mediaAsset.delete',
      'tx.finalize.commit',
    ]);
  });

  it('leaves purge claim and omits deletedKeys when the second storage key fails', async () => {
    const assetId = '33333333-3333-4333-8333-333333333333';
    const masterKey = `masters/${assetId}.jpg`;
    const derivKey = `derivatives/${assetId}/400.webp`;
    let deletes = 0;

    const storage: MediaStorage = {
      driver: 'local',
      put: async () => undefined,
      get: async () => null,
      head: async () => ({ exists: false }),
      getPublicUrl: (key) => key,
      delete: async () => {
        deletes += 1;
        if (deletes >= 2) {
          throw new Error('boom');
        }
      },
    };

    let purgeStartedAt: Date | null = null;
    const prisma = {
      client: {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: async () => [
              {
                id: assetId,
                orphaned_at: new Date('2020-01-01T00:00:00.000Z'),
                purge_started_at: purgeStartedAt,
              },
            ],
            productMedia: { count: async () => 0 },
            navigationMenuItem: { count: async () => 0 },
            mediaAsset: {
              update: async (args: { data: { purgeStartedAt?: Date } }) => {
                if (args.data.purgeStartedAt) purgeStartedAt = args.data.purgeStartedAt;
              },
              delete: async () => {
                throw new Error('must not delete DB after storage failure');
              },
            },
            mediaDerivative: {
              deleteMany: async () => {
                throw new Error('must not delete derivatives after storage failure');
              },
            },
          };
          return fn(tx);
        },
        $executeRaw: async () => 0,
        mediaAsset: {
          findMany: async (): Promise<OrphanRow[]> => [
            {
              id: assetId,
              storageKey: masterKey,
              byteSize: 1,
              createdAt: new Date('2020-01-01T00:00:00.000Z'),
              orphanedAt: new Date('2020-01-01T00:00:00.000Z'),
              derivatives: [{ storageKey: derivKey, byteSize: 1 }],
            },
          ],
        },
      },
    };

    const service = new MediaOrphanService(prisma as never, storage);
    const report = await service.cleanup({ dryRun: false, graceHours: 1, limit: 1 });

    expect(report.deletedAssets).toEqual([]);
    expect(report.deletedKeys).toEqual([]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.assetId).toBe(assetId);
    expect(purgeStartedAt).toBeInstanceOf(Date);
  });

  it('skips storage delete when a reference appears under claim FOR UPDATE', async () => {
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

    const prisma = {
      client: {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: async () => [
              {
                id: assetId,
                orphaned_at: new Date('2020-01-01T00:00:00.000Z'),
                purge_started_at: null,
              },
            ],
            productMedia: { count: async () => 1 },
            navigationMenuItem: { count: async () => 0 },
            mediaAsset: {
              update: async () => {
                events.push('clear.claim');
              },
              delete: async () => {
                events.push('db.delete');
              },
            },
            mediaDerivative: { deleteMany: async () => undefined },
          };
          return fn(tx);
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
    expect(events).toEqual(['clear.claim']);
    expect(events).not.toContain('storage.delete');
  });
});

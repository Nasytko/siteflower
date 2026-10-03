import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MEDIA_ORPHAN_GRACE_HOURS } from './media.constants';
import { orphanGraceCutoff } from './media-orphan.util';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';

export type OrphanCandidate = {
  id: string;
  storageKey: string;
  byteSize: number;
  createdAt: string;
  orphanedAt: string;
  derivativeKeys: string[];
  estimatedBytes: number;
};

export type CleanupReport = {
  dryRun: boolean;
  graceHours: number;
  scanned: number;
  candidates: OrphanCandidate[];
  deletedAssets: string[];
  deletedKeys: string[];
  skippedLocked: string[];
  failures: Array<{ assetId: string; error: string }>;
  estimatedReclaimableBytes: number;
};

/**
 * Orphan = MediaAsset with zero ProductMedia (sole business reference today).
 * Physical delete only after orphanedAt + grace period. Idempotent; missing objects OK.
 *
 * Deletion order: storage objects first (master + derivatives), then DB rows.
 * If storage delete fails mid-way, DB metadata remains so retry can find keys.
 */
@Injectable()
export class MediaOrphanService {
  private readonly logger = new Logger(MediaOrphanService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /**
   * Heal marker drift (e.g. ProductMedia cascade without app detach):
   * - unreferenced + null orphanedAt → set orphanedAt = now (starts grace)
   * - referenced + orphanedAt set → clear orphanedAt
   */
  async reconcileOrphanMarkers(): Promise<{ marked: number; cleared: number }> {
    const marked = await this.prisma.client.$executeRaw`
      UPDATE media_assets AS ma
      SET orphaned_at = NOW()
      WHERE ma.orphaned_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM product_media pm WHERE pm.media_asset_id = ma.id
        )
    `;
    const cleared = await this.prisma.client.$executeRaw`
      UPDATE media_assets AS ma
      SET orphaned_at = NULL
      WHERE ma.orphaned_at IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM product_media pm WHERE pm.media_asset_id = ma.id
        )
    `;
    return { marked: Number(marked), cleared: Number(cleared) };
  }

  async findOrphanCandidates(options?: {
    graceHours?: number;
    limit?: number;
    reconcile?: boolean;
  }): Promise<OrphanCandidate[]> {
    if (options?.reconcile !== false) {
      await this.reconcileOrphanMarkers();
    }

    const graceHours = options?.graceHours ?? MEDIA_ORPHAN_GRACE_HOURS;
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
    const cutoff = orphanGraceCutoff(graceHours);

    const assets = await this.prisma.client.mediaAsset.findMany({
      where: {
        productMedia: { none: {} },
        orphanedAt: { not: null, lte: cutoff },
      },
      include: { derivatives: { select: { storageKey: true, byteSize: true } } },
      orderBy: { orphanedAt: 'asc' },
      take: limit,
    });

    return assets.map((asset) => {
      const derivativeKeys = asset.derivatives.map((d) => d.storageKey);
      const estimatedBytes =
        asset.byteSize + asset.derivatives.reduce((sum, d) => sum + d.byteSize, 0);
      return {
        id: asset.id,
        storageKey: asset.storageKey,
        byteSize: asset.byteSize,
        createdAt: asset.createdAt.toISOString(),
        orphanedAt: (asset.orphanedAt ?? asset.createdAt).toISOString(),
        derivativeKeys,
        estimatedBytes,
      };
    });
  }

  async cleanup(options?: {
    dryRun?: boolean;
    graceHours?: number;
    limit?: number;
  }): Promise<CleanupReport> {
    const dryRun = options?.dryRun !== false; // default dry-run safe
    const graceHours = options?.graceHours ?? MEDIA_ORPHAN_GRACE_HOURS;
    const limit = options?.limit ?? 50;

    const candidates = await this.findOrphanCandidates({ graceHours, limit });
    const report: CleanupReport = {
      dryRun,
      graceHours,
      scanned: candidates.length,
      candidates,
      deletedAssets: [],
      deletedKeys: [],
      skippedLocked: [],
      failures: [],
      estimatedReclaimableBytes: candidates.reduce((s, c) => s + c.estimatedBytes, 0),
    };

    if (dryRun) {
      return report;
    }

    for (const candidate of candidates) {
      try {
        await this.deleteOrphanAsset(candidate, report, graceHours);
      } catch (err) {
        report.failures.push({
          assetId: candidate.id,
          error: (err as Error).message,
        });
        this.logger.error(
          `media_orphan_cleanup_failed assetId=${candidate.id} err=${(err as Error).message}`,
        );
      }
    }

    return report;
  }

  private async deleteOrphanAsset(
    candidate: OrphanCandidate,
    report: CleanupReport,
    graceHours: number,
  ): Promise<void> {
    const cutoff = orphanGraceCutoff(graceHours);

    // Lock row and re-verify no references + still past grace before storage deletes.
    const stillOrphan = await this.prisma.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; orphaned_at: Date | null }>>`
        SELECT id, orphaned_at FROM media_assets WHERE id = ${candidate.id}::uuid FOR UPDATE
      `;
      if (rows.length === 0) return false;
      const refs = await tx.productMedia.count({ where: { mediaAssetId: candidate.id } });
      if (refs > 0) {
        await tx.mediaAsset.update({
          where: { id: candidate.id },
          data: { orphanedAt: null },
        });
        return false;
      }
      const orphanedAt = rows[0]?.orphaned_at;
      if (!orphanedAt || orphanedAt > cutoff) return false;
      return true;
    });

    if (!stillOrphan) {
      report.skippedLocked.push(candidate.id);
      return;
    }

    // Re-check refs after lock release window before destructive deletes —
    // second transaction with FOR UPDATE again immediately before DB delete.
    const keys = [candidate.storageKey, ...candidate.derivativeKeys];
    for (const key of keys) {
      try {
        await this.storage.delete(key);
        report.deletedKeys.push(key);
      } catch (err) {
        throw new Error(`storage_delete_failed key=${key}: ${(err as Error).message}`);
      }
    }

    await this.prisma.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM media_assets WHERE id = ${candidate.id}::uuid FOR UPDATE
      `;
      if (rows.length === 0) return;
      const refs = await tx.productMedia.count({ where: { mediaAssetId: candidate.id } });
      if (refs > 0) {
        await tx.mediaAsset.update({
          where: { id: candidate.id },
          data: { orphanedAt: null },
        });
        report.skippedLocked.push(candidate.id);
        return;
      }
      await tx.mediaDerivative.deleteMany({ where: { mediaAssetId: candidate.id } });
      await tx.mediaAsset.delete({ where: { id: candidate.id } });
      report.deletedAssets.push(candidate.id);
    });

    this.logger.log(`media_orphan_deleted assetId=${candidate.id} keys=${keys.length}`);
  }
}

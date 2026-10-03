import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import {
  DERIVATIVE_AVIF_QUALITY,
  DERIVATIVE_FORMATS,
  DERIVATIVE_WEBP_QUALITY,
  DERIVATIVE_WIDTHS,
  MEDIA_HEALTHCHECK_PREFIX,
  MEDIA_MAX_INPUT_PIXELS,
  MEDIA_ORPHAN_GRACE_HOURS,
} from './media.constants';
import { orphanGraceCutoff } from './media-orphan.util';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';
import sharp from 'sharp';
import type { MediaFormat } from '@bouquet-one/database';

export type StorageConnectivityResult = {
  ok: boolean;
  driver: 'local' | 's3';
  writeOk: boolean;
  readOk: boolean;
  deleteOk: boolean;
  latencyMs: number;
  checkedAt: string;
  error: string | null;
};

export type MediaConsistencyReport = {
  checkedAt: string;
  driver: 'local' | 's3';
  assetCount: number;
  referencedAssets: number;
  orphanCandidates: number;
  orphanWithinGrace: number;
  missingMasters: Array<{ assetId: string; storageKey: string; productIds: string[] }>;
  missingDerivatives: Array<{
    assetId: string;
    derivativeId: string;
    storageKey: string;
    width: number;
    format: string;
  }>;
  productsMissingPrimary: Array<{ productId: string; slug: string; lifecycle: string }>;
  productsMultiplePrimary: Array<{ productId: string; slug: string; count: number }>;
  storageProbe: StorageConnectivityResult | null;
};

@Injectable()
export class MediaHealthService {
  private readonly logger = new Logger(MediaHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /**
   * Safe technical write → head/get → delete under healthchecks/ prefix.
   * Never touches product media. Always best-effort cleanup.
   */
  async probeStorage(): Promise<StorageConnectivityResult> {
    const checkedAt = new Date().toISOString();
    const started = Date.now();
    const key = `${MEDIA_HEALTHCHECK_PREFIX}${randomUUID()}.txt`;
    const body = Buffer.from(`siteflower-media-health ${checkedAt}\n`, 'utf8');
    let writeOk = false;
    let readOk = false;
    let deleteOk = false;
    let error: string | null = null;

    try {
      await this.storage.put({
        key,
        body,
        contentType: 'text/plain; charset=utf-8',
        cacheControl: 'no-store',
      });
      writeOk = true;

      const head = await this.storage.head(key);
      const got = await this.storage.get(key);
      readOk = head.exists && got != null && got.equals(body);

      await this.storage.delete(key);
      const after = await this.storage.head(key);
      deleteOk = !after.exists;
    } catch (err) {
      error = sanitizeStorageError((err as Error).message);
      this.logger.warn(`media_storage_probe_failed err=${error}`);
      try {
        await this.storage.delete(key);
      } catch {
        // best-effort
      }
    }

    return {
      ok: writeOk && readOk && deleteOk && !error,
      driver: this.storage.driver,
      writeOk,
      readOk,
      deleteOk,
      latencyMs: Date.now() - started,
      checkedAt,
      error,
    };
  }

  /**
   * Bounded consistency diagnostics. Does not full-scan the bucket.
   * Checks DB-referenced assets' masters/derivatives via head().
   */
  async runConsistencyCheck(options?: {
    probeStorage?: boolean;
    sampleLimit?: number;
  }): Promise<MediaConsistencyReport> {
    const sampleLimit = Math.min(Math.max(options?.sampleLimit ?? 200, 1), 1000);
    const checkedAt = new Date().toISOString();
    const graceCutoff = orphanGraceCutoff(MEDIA_ORPHAN_GRACE_HOURS);

    // Heal marker drift before counting (cascade detach / attach races).
    await this.prisma.client.$executeRaw`
      UPDATE media_assets AS ma
      SET orphaned_at = NOW()
      WHERE ma.orphaned_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM product_media pm WHERE pm.media_asset_id = ma.id
        )
    `;
    await this.prisma.client.$executeRaw`
      UPDATE media_assets AS ma
      SET orphaned_at = NULL
      WHERE ma.orphaned_at IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM product_media pm WHERE pm.media_asset_id = ma.id
        )
    `;

    const [assetCount, referencedAssets, orphanWithinGrace, orphanCandidates] =
      await Promise.all([
        this.prisma.client.mediaAsset.count(),
        this.prisma.client.mediaAsset.count({ where: { productMedia: { some: {} } } }),
        this.prisma.client.mediaAsset.count({
          where: {
            productMedia: { none: {} },
            orphanedAt: { not: null, gt: graceCutoff },
          },
        }),
        this.prisma.client.mediaAsset.count({
          where: {
            productMedia: { none: {} },
            orphanedAt: { not: null, lte: graceCutoff },
          },
        }),
      ]);

    const assets = await this.prisma.client.mediaAsset.findMany({
      take: sampleLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        derivatives: true,
        productMedia: { select: { productId: true } },
      },
    });

    const missingMasters: MediaConsistencyReport['missingMasters'] = [];
    const missingDerivatives: MediaConsistencyReport['missingDerivatives'] = [];

    for (const asset of assets) {
      try {
        const head = await this.storage.head(asset.storageKey);
        if (!head.exists) {
          missingMasters.push({
            assetId: asset.id,
            storageKey: asset.storageKey,
            productIds: [...new Set(asset.productMedia.map((p) => p.productId))],
          });
        }
      } catch (err) {
        this.logger.warn(
          `media_check_head_failed key=${asset.storageKey} err=${sanitizeStorageError((err as Error).message)}`,
        );
      }
      for (const d of asset.derivatives) {
        try {
          const head = await this.storage.head(d.storageKey);
          if (!head.exists) {
            missingDerivatives.push({
              assetId: asset.id,
              derivativeId: d.id,
              storageKey: d.storageKey,
              width: d.width,
              format: d.format,
            });
          }
        } catch {
          // counted via warning logs; continue
        }
      }
    }

    const productsMissingPrimary = await this.prisma.client.$queryRaw<
      Array<{ productId: string; slug: string; lifecycle: string }>
    >`
      SELECT p.id AS "productId", p.slug, p.lifecycle::text AS lifecycle
      FROM products p
      WHERE p.lifecycle = 'PUBLISHED'
        AND NOT EXISTS (
          SELECT 1 FROM product_media pm WHERE pm.product_id = p.id AND pm.is_primary = true
        )
      LIMIT 100
    `;

    const productsMultiplePrimary = await this.prisma.client.$queryRaw<
      Array<{ productId: string; slug: string; count: number }>
    >`
      SELECT pm.product_id AS "productId", p.slug, COUNT(*)::int AS count
      FROM product_media pm
      JOIN products p ON p.id = pm.product_id
      WHERE pm.is_primary = true
      GROUP BY pm.product_id, p.slug
      HAVING COUNT(*) > 1
      LIMIT 100
    `;

    let storageProbe: StorageConnectivityResult | null = null;
    if (options?.probeStorage) {
      storageProbe = await this.probeStorage();
    }

    return {
      checkedAt,
      driver: this.storage.driver,
      assetCount,
      referencedAssets,
      orphanCandidates,
      orphanWithinGrace,
      missingMasters,
      missingDerivatives,
      productsMissingPrimary,
      productsMultiplePrimary,
      storageProbe,
    };
  }
}

@Injectable()
export class MediaRepairService {
  private readonly logger = new Logger(MediaRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /**
   * Regenerate missing derivatives from normalized master.
   * Does not fabricate missing masters. Does not alter ProductMedia.
   */
  async repairMissingDerivatives(options?: {
    dryRun?: boolean;
    limit?: number;
  }): Promise<{
    dryRun: boolean;
    scanned: number;
    repaired: string[];
    skippedMissingMaster: string[];
    failures: Array<{ assetId: string; error: string }>;
  }> {
    const dryRun = options?.dryRun !== false;
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    const assets = await this.prisma.client.mediaAsset.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { derivatives: true },
    });

    const repaired: string[] = [];
    const skippedMissingMaster: string[] = [];
    const failures: Array<{ assetId: string; error: string }> = [];

    for (const asset of assets) {
      try {
        const masterHead = await this.storage.head(asset.storageKey);
        if (!masterHead.exists) {
          skippedMissingMaster.push(asset.id);
          continue;
        }

        const existing = new Set(asset.derivatives.map((d) => `${d.width}:${d.format}`));
        const needed: Array<{ width: number; format: MediaFormat; mime: string; sharp: 'webp' | 'avif' }> =
          [];
        const sourceWidth = asset.width ?? 0;
        for (const dw of DERIVATIVE_WIDTHS) {
          if (sourceWidth > 0 && sourceWidth < dw) continue;
          for (const fmt of DERIVATIVE_FORMATS) {
            if (!existing.has(`${dw}:${fmt.format}`)) {
              needed.push({ width: dw, ...fmt });
            } else {
              // also regenerate if object missing
              const row = asset.derivatives.find(
                (d) => d.width === dw && d.format === fmt.format,
              );
              if (row) {
                const head = await this.storage.head(row.storageKey);
                if (!head.exists) {
                  needed.push({ width: dw, ...fmt });
                }
              }
            }
          }
        }

        if (needed.length === 0) continue;
        if (dryRun) {
          repaired.push(asset.id);
          continue;
        }

        const master = await this.storage.get(asset.storageKey);
        if (!master) {
          skippedMissingMaster.push(asset.id);
          continue;
        }

        // Verify master still decodes
        await sharp(master, { limitInputPixels: MEDIA_MAX_INPUT_PIXELS }).metadata();

        for (const n of needed) {
          let pipeline = sharp(master, { limitInputPixels: MEDIA_MAX_INPUT_PIXELS }).resize({
            width: n.width,
            withoutEnlargement: true,
            fit: 'inside',
          });
          pipeline =
            n.sharp === 'webp'
              ? pipeline.webp({ quality: DERIVATIVE_WEBP_QUALITY })
              : pipeline.avif({ quality: DERIVATIVE_AVIF_QUALITY });
          const out = await pipeline.toBuffer();
          const key = `derivatives/${asset.id}/w${n.width}.${n.sharp}`;
          await this.storage.put({
            key,
            body: out,
            contentType: n.mime,
            cacheControl: 'public, max-age=31536000, immutable',
          });

          await this.prisma.client.mediaDerivative.upsert({
            where: {
              mediaAssetId_width_format: {
                mediaAssetId: asset.id,
                width: n.width,
                format: n.format,
              },
            },
            create: {
              mediaAssetId: asset.id,
              width: n.width,
              format: n.format,
              storageKey: key,
              byteSize: out.byteLength,
            },
            update: {
              storageKey: key,
              byteSize: out.byteLength,
            },
          });
        }

        repaired.push(asset.id);
        this.logger.log(`media_repair_ok assetId=${asset.id} derivatives=${needed.length}`);
      } catch (err) {
        failures.push({ assetId: asset.id, error: (err as Error).message });
      }
    }

    return {
      dryRun,
      scanned: assets.length,
      repaired,
      skippedMissingMaster,
      failures,
    };
  }
}

function sanitizeStorageError(message: string): string {
  return message
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]')
    .replace(/(Secret|Password|Key|Token)[=:]\s*\S+/gi, '$1=[REDACTED]')
    .slice(0, 240);
}

import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import sharp, { type Sharp, type Metadata } from 'sharp';
import FileType from 'file-type';
import type { MediaFormat } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import {
  DERIVATIVE_AVIF_QUALITY,
  DERIVATIVE_FORMATS,
  DERIVATIVE_WEBP_QUALITY,
  DERIVATIVE_WIDTHS,
  MASTER_AVIF_QUALITY,
  MASTER_JPEG_QUALITY,
  MASTER_WEBP_QUALITY,
  MEDIA_MAX_DIMENSION,
  MEDIA_MAX_INPUT_PIXELS,
  MEDIA_PROCESS_CONCURRENCY,
} from './media.constants';
import { MEDIA_ERROR_CODES, mediaHttpException } from './media-errors';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';

const ALLOWED = new Map<string, MediaFormat>([
  ['image/jpeg', 'JPEG'],
  ['image/png', 'PNG'],
  ['image/webp', 'WEBP'],
  ['image/avif', 'AVIF'],
]);

/** Long cache for UUID-keyed immutable objects. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

let processSlots = MEDIA_PROCESS_CONCURRENCY;
const processWaiters: Array<() => void> = [];

async function withProcessSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (processSlots <= 0) {
    await new Promise<void>((resolve) => processWaiters.push(resolve));
  }
  processSlots -= 1;
  try {
    return await fn();
  } finally {
    processSlots += 1;
    const next = processWaiters.shift();
    if (next) next();
  }
}

async function encodeNormalizedMaster(
  image: Sharp,
  format: MediaFormat,
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  // Strip EXIF/XMP/IPTC — never call withMetadata().
  switch (format) {
    case 'JPEG':
      return {
        buffer: await image.jpeg({ quality: MASTER_JPEG_QUALITY, mozjpeg: true }).toBuffer(),
        mime: 'image/jpeg',
        ext: 'jpg',
      };
    case 'PNG':
      return {
        buffer: await image.png({ compressionLevel: 6 }).toBuffer(),
        mime: 'image/png',
        ext: 'png',
      };
    case 'WEBP':
      return {
        buffer: await image.webp({ quality: MASTER_WEBP_QUALITY }).toBuffer(),
        mime: 'image/webp',
        ext: 'webp',
      };
    case 'AVIF':
      return {
        buffer: await image.avif({ quality: MASTER_AVIF_QUALITY }).toBuffer(),
        mime: 'image/avif',
        ext: 'avif',
      };
    default:
      throw mediaHttpException(MEDIA_ERROR_CODES.MEDIA_UNSUPPORTED);
  }
}

/**
 * Decode + auto-orient. For JPEG that fails the strict pipeline, retry once
 * with sRGB conversion (common for CMYK / odd ICC profiles from cameras).
 */
async function decodeImage(
  buffer: Buffer,
  format: MediaFormat,
  log: Logger,
): Promise<{ image: Sharp; meta: Metadata }> {
  const tryDecode = async (pipeline: Sharp) => {
    const image = pipeline.rotate();
    const meta = await image.metadata();
    return { image, meta };
  };

  try {
    return await tryDecode(
      sharp(buffer, {
        failOn: 'error',
        limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
      }),
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn(`media_decode_primary_failed format=${format} err=${detail}`);
    if (isPixelLimitError(detail)) {
      throw mediaHttpException(MEDIA_ERROR_CODES.IMAGE_DIMENSIONS_TOO_LARGE);
    }
    if (format === 'JPEG') {
      try {
        return await tryDecode(
          sharp(buffer, {
            failOn: 'error',
            limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
          }).toColourspace('srgb'),
        );
      } catch (retryErr) {
        const retryDetail = retryErr instanceof Error ? retryErr.message : String(retryErr);
        log.warn(`media_decode_srgb_failed format=${format} err=${retryDetail}`);
        if (isPixelLimitError(retryDetail)) {
          throw mediaHttpException(MEDIA_ERROR_CODES.IMAGE_DIMENSIONS_TOO_LARGE);
        }
      }
    }
    throw mediaHttpException(MEDIA_ERROR_CODES.IMAGE_DECODE_FAILED);
  }
}

function isPixelLimitError(detail: string): boolean {
  return /pixel limit|input image exceeds|limitInputPixels/i.test(detail);
}

export type MediaAssetDto = {
  id: string;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  derivatives: Array<{ width: number; format: string; url: string }>;
};

/**
 * Media upload pipeline.
 *
 * Consistency model (storage + Postgres cannot share one ACID transaction):
 * 1. Validate + normalize in memory
 * 2. Put master + derivatives; track every written key
 * 3. Persist MediaAsset + MediaDerivative rows
 * 4. On any failure after step 2: best-effort delete newly written keys
 *
 * Never deletes keys that existed before this upload attempt.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  getPublicUrl(key: string): string {
    return this.storage.getPublicUrl(key);
  }

  async uploadImage(buffer: Buffer, originalName?: string): Promise<MediaAssetDto> {
    void originalName; // never used as storage path
    return withProcessSlot(() => this.uploadImageInner(buffer));
  }

  private async uploadImageInner(buffer: Buffer): Promise<MediaAssetDto> {
    if (buffer.byteLength > this.appConfig.mediaMaxBytes) {
      throw mediaHttpException(MEDIA_ERROR_CODES.MEDIA_TOO_LARGE);
    }

    const detected = await FileType.fromBuffer(buffer);
    if (!detected || !ALLOWED.has(detected.mime)) {
      throw mediaHttpException(MEDIA_ERROR_CODES.MEDIA_UNSUPPORTED);
    }
    const format = ALLOWED.get(detected.mime)!;

    const { image, meta } = await decodeImage(buffer, format, this.logger);

    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width <= 0 || height <= 0) {
      this.logger.warn(`media_decode_zero_dimensions format=${format}`);
      throw mediaHttpException(MEDIA_ERROR_CODES.IMAGE_DECODE_FAILED);
    }
    if (width > MEDIA_MAX_DIMENSION || height > MEDIA_MAX_DIMENSION) {
      throw mediaHttpException(MEDIA_ERROR_CODES.IMAGE_DIMENSIONS_TOO_LARGE);
    }
    if (width * height > MEDIA_MAX_INPUT_PIXELS) {
      throw mediaHttpException(MEDIA_ERROR_CODES.IMAGE_DIMENSIONS_TOO_LARGE);
    }

    let masterEncoded: { buffer: Buffer; mime: string; ext: string };
    try {
      masterEncoded = await encodeNormalizedMaster(image.clone(), format);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`media_encode_failed format=${format} err=${detail}`);
      throw mediaHttpException(MEDIA_ERROR_CODES.IMAGE_PROCESSING_FAILED);
    }

    const masterBuffer = masterEncoded.buffer;
    // Checksum describes the exact normalized master bytes that are stored.
    const checksum = createHash('sha256').update(masterBuffer).digest('hex');
    const assetId = randomUUID();
    const masterKey = `masters/${assetId}.${masterEncoded.ext}`;

    const derivatives: Array<{
      width: number;
      format: MediaFormat;
      storageKey: string;
      byteSize: number;
      body: Buffer;
      contentType: string;
    }> = [];

    for (const dw of DERIVATIVE_WIDTHS) {
      if (width < dw) continue;
      for (const fmt of DERIVATIVE_FORMATS) {
        try {
          let pipeline = sharp(masterBuffer, { limitInputPixels: MEDIA_MAX_INPUT_PIXELS }).resize({
            width: dw,
            withoutEnlargement: true,
            fit: 'inside',
          });
          pipeline =
            fmt.sharp === 'webp'
              ? pipeline.webp({ quality: DERIVATIVE_WEBP_QUALITY })
              : pipeline.avif({ quality: DERIVATIVE_AVIF_QUALITY });
          const out = await pipeline.toBuffer();
          derivatives.push({
            width: dw,
            format: fmt.format,
            storageKey: `derivatives/${assetId}/w${dw}.${fmt.sharp}`,
            byteSize: out.byteLength,
            body: out,
            contentType: fmt.mime,
          });
        } catch {
          // AVIF may fail on some platforms — skip that derivative only
        }
      }
    }

    const writtenKeys: string[] = [];
    const compensate = async (reason: string) => {
      this.logger.warn(
        `media_upload_compensate assetId=${assetId} keys=${writtenKeys.length} reason=${reason}`,
      );
      for (const key of [...writtenKeys].reverse()) {
        try {
          await this.storage.delete(key);
        } catch (err) {
          this.logger.error(
            `media_upload_compensate_failed key=${key} err=${(err as Error).message}`,
          );
        }
      }
    };

    try {
      writtenKeys.push(masterKey);
      await this.storage.put({
        key: masterKey,
        body: masterBuffer,
        contentType: masterEncoded.mime,
        cacheControl: IMMUTABLE_CACHE,
      });

      for (const d of derivatives) {
        writtenKeys.push(d.storageKey);
        await this.storage.put({
          key: d.storageKey,
          body: d.body,
          contentType: d.contentType,
          cacheControl: IMMUTABLE_CACHE,
        });
      }

      try {
        await this.prisma.client.$transaction(async (tx) => {
          await tx.mediaAsset.create({
            data: {
              id: assetId,
              storageKey: masterKey,
              mimeType: masterEncoded.mime,
              format,
              byteSize: masterBuffer.byteLength,
              width,
              height,
              checksumSha256: checksum,
            },
          });
          if (derivatives.length > 0) {
            await tx.mediaDerivative.createMany({
              data: derivatives.map((d) => ({
                mediaAssetId: assetId,
                width: d.width,
                format: d.format,
                storageKey: d.storageKey,
                byteSize: d.byteSize,
              })),
            });
          }
        });
      } catch (err) {
        await compensate('db_persist_failed');
        this.logger.error(
          `media_upload_db_failed assetId=${assetId} size=${masterBuffer.byteLength} err=${(err as Error).message}`,
        );
        throw mediaHttpException(MEDIA_ERROR_CODES.STORAGE_FAILED, HttpStatus.SERVICE_UNAVAILABLE);
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      await compensate('storage_put_failed');
      this.logger.error(
        `media_upload_storage_failed assetId=${assetId} err=${(err as Error).message}`,
      );
      throw mediaHttpException(MEDIA_ERROR_CODES.STORAGE_FAILED, HttpStatus.SERVICE_UNAVAILABLE);
    }

    this.logger.log(
      `media_upload_ok assetId=${assetId} bytes=${masterBuffer.byteLength} ${width}x${height} derivatives=${derivatives.length}`,
    );

    const dto = await this.getAssetDto(assetId);
    if (!dto) {
      throw mediaHttpException(MEDIA_ERROR_CODES.STORAGE_FAILED, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return dto;
  }

  async getAssetDto(id: string): Promise<MediaAssetDto | null> {
    const asset = await this.prisma.client.mediaAsset.findUnique({
      where: { id },
      include: { derivatives: true },
    });
    if (!asset) return null;
    return {
      id: asset.id,
      url: this.storage.getPublicUrl(asset.storageKey),
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      derivatives: asset.derivatives.map((d) => ({
        width: d.width,
        format: d.format,
        url: this.storage.getPublicUrl(d.storageKey),
      })),
    };
  }
}

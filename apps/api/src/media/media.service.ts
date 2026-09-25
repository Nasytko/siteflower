import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import sharp from 'sharp';
import FileType from 'file-type';
import type { MediaFormat } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';

const ALLOWED = new Map<string, MediaFormat>([
  ['image/jpeg', 'JPEG'],
  ['image/png', 'PNG'],
  ['image/webp', 'WEBP'],
  ['image/avif', 'AVIF'],
]);

const DERIVATIVE_WIDTHS = [400, 800, 1200, 1600] as const;
const DERIVATIVE_FORMATS: Array<{ format: MediaFormat; mime: string; sharp: 'webp' | 'avif' }> = [
  { format: 'WEBP', mime: 'image/webp', sharp: 'webp' },
  { format: 'AVIF', mime: 'image/avif', sharp: 'avif' },
];

/** Decompression-bomb guard: ~25MP covers high-res bouquet photography. */
export const MEDIA_MAX_INPUT_PIXELS = 25_000_000;
/** Max edge after rotate — boutique product photos. */
export const MEDIA_MAX_DIMENSION = 6000;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  getPublicUrl(key: string): string {
    return this.storage.getPublicUrl(key);
  }

  async uploadImage(buffer: Buffer, originalName?: string) {
    void originalName;
    if (buffer.byteLength > this.appConfig.mediaMaxBytes) {
      throw new BadRequestException('File exceeds maximum allowed size');
    }

    const detected = await FileType.fromBuffer(buffer);
    if (!detected || !ALLOWED.has(detected.mime)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, and AVIF images are allowed');
    }
    const format = ALLOWED.get(detected.mime)!;

    let image: ReturnType<typeof sharp>;
    try {
      image = sharp(buffer, {
        failOn: 'error',
        limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
      }).rotate();
    } catch {
      throw new BadRequestException('Invalid or unsupported image');
    }

    const meta = await image.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new BadRequestException('Invalid image dimensions');
    }
    if (width > MEDIA_MAX_DIMENSION || height > MEDIA_MAX_DIMENSION) {
      throw new BadRequestException(
        `Image dimensions exceed ${MEDIA_MAX_DIMENSION}×${MEDIA_MAX_DIMENSION}`,
      );
    }
    if (width * height > MEDIA_MAX_INPUT_PIXELS) {
      throw new BadRequestException('Image pixel count exceeds allowed limit');
    }

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const assetId = randomUUID();
    const ext = detected.ext;
    const masterKey = `masters/${assetId}.${ext}`;

    // Strip EXIF/XMP/IPTC — do not call withMetadata().
    const masterBuffer = await image.clone().toBuffer();

    await this.storage.put({
      key: masterKey,
      body: masterBuffer,
      contentType: detected.mime,
    });

    const asset = await this.prisma.client.mediaAsset.create({
      data: {
        id: assetId,
        storageKey: masterKey,
        mimeType: detected.mime,
        format,
        byteSize: masterBuffer.byteLength,
        width,
        height,
        checksumSha256: checksum,
      },
    });

    const derivatives: Array<{
      width: number;
      format: MediaFormat;
      storageKey: string;
      byteSize: number;
    }> = [];

    const sourceWidth = width;
    for (const dw of DERIVATIVE_WIDTHS) {
      if (sourceWidth > 0 && sourceWidth < dw) continue;
      for (const fmt of DERIVATIVE_FORMATS) {
        try {
          let pipeline = sharp(masterBuffer, { limitInputPixels: MEDIA_MAX_INPUT_PIXELS }).resize({
            width: dw,
            withoutEnlargement: true,
            fit: 'inside',
          });
          pipeline =
            fmt.sharp === 'webp'
              ? pipeline.webp({ quality: 82 })
              : pipeline.avif({ quality: 55 });
          const out = await pipeline.toBuffer();
          const key = `derivatives/${assetId}/w${dw}.${fmt.sharp}`;
          await this.storage.put({ key, body: out, contentType: fmt.mime });
          derivatives.push({
            width: dw,
            format: fmt.format,
            storageKey: key,
            byteSize: out.byteLength,
          });
        } catch {
          // AVIF may fail on some platforms — skip that derivative
        }
      }
    }

    if (derivatives.length > 0) {
      await this.prisma.client.mediaDerivative.createMany({
        data: derivatives.map((d) => ({
          mediaAssetId: asset.id,
          width: d.width,
          format: d.format,
          storageKey: d.storageKey,
          byteSize: d.byteSize,
        })),
      });
    }

    return this.getAssetDto(asset.id);
  }

  async getAssetDto(id: string) {
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

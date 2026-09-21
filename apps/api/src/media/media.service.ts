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
    if (buffer.byteLength > this.appConfig.mediaMaxBytes) {
      throw new BadRequestException('File exceeds maximum allowed size');
    }

    const detected = await FileType.fromBuffer(buffer);
    if (!detected || !ALLOWED.has(detected.mime)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, and AVIF images are allowed');
    }
    const format = ALLOWED.get(detected.mime)!;

    const image = sharp(buffer, { failOn: 'none' }).rotate();
    const meta = await image.metadata();
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const assetId = randomUUID();
    const ext = detected.ext;
    const masterKey = `masters/${assetId}.${ext}`;

    const masterBuffer = await image
      .clone()
      .withMetadata({ exif: undefined, icc: undefined })
      .toBuffer();

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
        width: meta.width ?? null,
        height: meta.height ?? null,
        checksumSha256: checksum,
      },
    });

    const derivatives: Array<{
      width: number;
      format: MediaFormat;
      storageKey: string;
      byteSize: number;
    }> = [];

    const sourceWidth = meta.width ?? 0;
    for (const width of DERIVATIVE_WIDTHS) {
      if (sourceWidth > 0 && sourceWidth < width) continue;
      for (const fmt of DERIVATIVE_FORMATS) {
        try {
          let pipeline = sharp(masterBuffer).resize({
            width,
            withoutEnlargement: true,
            fit: 'inside',
          });
          pipeline =
            fmt.sharp === 'webp'
              ? pipeline.webp({ quality: 82 })
              : pipeline.avif({ quality: 55 });
          const out = await pipeline.toBuffer();
          const key = `derivatives/${assetId}/w${width}.${fmt.sharp}`;
          await this.storage.put({ key, body: out, contentType: fmt.mime });
          derivatives.push({
            width,
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

    void originalName;
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

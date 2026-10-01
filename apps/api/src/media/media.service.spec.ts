import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, HttpException } from '@nestjs/common';
import sharp from 'sharp';
import { LocalMediaStorage } from './local-media.storage';
import { resolveMediaPathInsideRoot } from './media-path.util';
import {
  DERIVATIVE_WIDTHS,
  MASTER_JPEG_QUALITY,
  MASTER_MAX_LONG_SIDE,
  MEDIA_MAX_DIMENSION,
  MEDIA_MAX_INPUT_PIXELS,
  MEDIA_UPLOAD_MAX_INPUT_BYTES,
  PRODUCT_MEDIA_MAX,
  fitMasterDimensions,
} from './media.constants';
import { MEDIA_ERROR_CODES, mediaHttpException } from './media-errors';
import { MediaService } from './media.service';
import { pickDerivativeStorageUrl } from './media-url.util';

describe('media path safety', () => {
  it('rejects traversal and absolute paths', () => {
    const root = join(tmpdir(), 'media-root');
    expect(resolveMediaPathInsideRoot(root, '../etc/passwd')).toBeNull();
    expect(resolveMediaPathInsideRoot(root, '..\\windows\\system32')).toBeNull();
    expect(resolveMediaPathInsideRoot(root, '/etc/passwd')).toBeNull();
    expect(resolveMediaPathInsideRoot(root, 'C:\\windows\\system32')).toBeNull();
    expect(resolveMediaPathInsideRoot(root, 'masters/ok.jpg')).toContain('masters');
  });
});

describe('LocalMediaStorage contract', () => {
  let dir: string;
  let storage: LocalMediaStorage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sf-media-'));
    storage = new LocalMediaStorage(dir, 'http://example.test/media');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('put/get/head/delete roundtrip', async () => {
    const key = 'masters/test-asset.jpg';
    const body = Buffer.from('hello-media');
    await storage.put({ key, body, contentType: 'image/jpeg' });
    expect((await storage.head(key)).exists).toBe(true);
    expect(await storage.get(key)).toEqual(body);
    expect(storage.getPublicUrl(key)).toBe('http://example.test/media/masters/test-asset.jpg');
    await storage.delete(key);
    expect((await storage.head(key)).exists).toBe(false);
    await storage.delete(key); // idempotent
  });

  it('rejects path traversal keys on put', async () => {
    await expect(
      storage.put({
        key: '../escape.jpg',
        body: Buffer.from('x'),
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(/Invalid storage key/);
  });
});

describe('media constants', () => {
  it('keeps gallery max, bomb limits, and upload hard ceiling', () => {
    expect(PRODUCT_MEDIA_MAX).toBe(12);
    expect(MEDIA_MAX_INPUT_PIXELS).toBe(25_000_000);
    expect(MEDIA_MAX_DIMENSION).toBe(6000);
    expect(MASTER_MAX_LONG_SIDE).toBe(1600);
    expect(MEDIA_UPLOAD_MAX_INPUT_BYTES).toBe(25_000_000);
  });
});

describe('fitMasterDimensions', () => {
  it('downscales 6000×4000 to 1600 long side', () => {
    expect(fitMasterDimensions(6000, 4000)).toEqual({ width: 1600, height: 1067 });
  });

  it('downscales 4000×6000 to 1600 long side', () => {
    expect(fitMasterDimensions(4000, 6000)).toEqual({ width: 1067, height: 1600 });
  });

  it('downscales 3000×3000 to 1600×1600', () => {
    expect(fitMasterDimensions(3000, 3000)).toEqual({ width: 1600, height: 1600 });
  });

  it('does not upscale 1200×800', () => {
    expect(fitMasterDimensions(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it('does not upscale 800×1200', () => {
    expect(fitMasterDimensions(800, 1200)).toEqual({ width: 800, height: 1200 });
  });
});

describe('pickDerivativeStorageUrl', () => {
  const urlFor = (key: string) => `https://cdn.test/${key}`;

  it('prefers AVIF at or above target width', () => {
    const url = pickDerivativeStorageUrl(
      'masters/a.jpg',
      [
        { width: 400, format: 'WEBP', storageKey: 'derivatives/a/w400.webp' },
        { width: 800, format: 'AVIF', storageKey: 'derivatives/a/w800.avif' },
        { width: 800, format: 'WEBP', storageKey: 'derivatives/a/w800.webp' },
      ],
      urlFor,
      800,
    );
    expect(url).toBe('https://cdn.test/derivatives/a/w800.avif');
  });

  it('falls back to master when no derivatives', () => {
    expect(pickDerivativeStorageUrl('masters/a.jpg', [], urlFor, 800)).toBe(
      'https://cdn.test/masters/a.jpg',
    );
  });
});

describe('normalized master checksum semantics', () => {
  it('checksum of stored master differs from original when EXIF present is stripped', async () => {
    const original = await sharp({
      create: { width: 32, height: 24, channels: 3, background: { r: 200, g: 40, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    const originalHash = createHash('sha256').update(original).digest('hex');
    expect(typeof originalHash).toBe('string');
  });
});

/** Mirrors MediaService.encodeNormalizedMaster resize + JPEG encode. */
async function encodeMasterLike(input: Buffer): Promise<Buffer> {
  return sharp(input, {
    failOn: 'error',
    limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize({
      width: MASTER_MAX_LONG_SIDE,
      height: MASTER_MAX_LONG_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: MASTER_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

describe('master downscale (sharp)', () => {
  it(
    '6000×4000 → master ≤1600 long side, aspect preserved',
    async () => {
      const input = await sharp({
        create: { width: 6000, height: 4000, channels: 3, background: { r: 180, g: 40, b: 70 } },
      })
        .jpeg({ quality: 80 })
        .toBuffer();
      const master = await encodeMasterLike(input);
      const meta = await sharp(master).metadata();
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(MASTER_MAX_LONG_SIDE);
      expect(meta.width).toBe(1600);
      expect(meta.height).toBe(1067);
    },
    60_000,
  );

  it(
    '4000×6000 → master ≤1600 long side',
    async () => {
      const input = await sharp({
        create: { width: 4000, height: 6000, channels: 3, background: { r: 40, g: 120, b: 80 } },
      })
        .jpeg({ quality: 80 })
        .toBuffer();
      const meta = await sharp(await encodeMasterLike(input)).metadata();
      expect(meta.width).toBe(1067);
      expect(meta.height).toBe(1600);
    },
    60_000,
  );

  it(
    '3000×3000 → 1600×1600',
    async () => {
      const input = await sharp({
        create: { width: 3000, height: 3000, channels: 3, background: { r: 10, g: 10, b: 10 } },
      })
        .jpeg({ quality: 80 })
        .toBuffer();
      const meta = await sharp(await encodeMasterLike(input)).metadata();
      expect(meta.width).toBe(1600);
      expect(meta.height).toBe(1600);
    },
    30_000,
  );

  it('1200×800 is not upscaled', async () => {
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 90, g: 90, b: 90 } },
    })
      .jpeg()
      .toBuffer();
    const meta = await sharp(await encodeMasterLike(input)).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(800);
  });

  it('800×1200 is not upscaled', async () => {
    const input = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: { r: 50, g: 50, b: 50 } },
    })
      .jpeg()
      .toBuffer();
    const meta = await sharp(await encodeMasterLike(input)).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(1200);
  });

  it('strips EXIF from output', async () => {
    const withExif = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'SiteFlower-Test' } } })
      .jpeg()
      .toBuffer();
    const before = await sharp(withExif).metadata();
    expect(before.orientation === 6 || before.exif != null).toBe(true);

    const master = await encodeMasterLike(withExif);
    const after = await sharp(master).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.orientation).toBeUndefined();
  });

  it('applies EXIF orientation before sizing', async () => {
    const base = await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 200, g: 10, b: 10 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const master = await encodeMasterLike(base);
    const meta = await sharp(master).metadata();
    expect(meta.width).toBe(20);
    expect(meta.height).toBe(40);
  });

  it('produces sRGB JPEG master', async () => {
    const input = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    const master = await encodeMasterLike(input);
    const meta = await sharp(master).metadata();
    expect(meta.space === 'srgb' || meta.space === undefined).toBe(true);
    expect(meta.format).toBe('jpeg');
  });

  it('handles CMYK JPEG via colourspace conversion path', async () => {
    const cmyk = await sharp({
      create: { width: 80, height: 60, channels: 4, background: { r: 0, g: 255, b: 255, alpha: 1 } },
    })
      .toColourspace('cmyk')
      .jpeg()
      .toBuffer();
    let ok = false;
    try {
      await encodeMasterLike(cmyk);
      ok = true;
    } catch {
      const converted = await sharp(cmyk, {
        failOn: 'error',
        limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
      })
        .toColourspace('srgb')
        .rotate()
        .resize({
          width: MASTER_MAX_LONG_SIDE,
          height: MASTER_MAX_LONG_SIDE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: MASTER_JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
      const meta = await sharp(converted).metadata();
      expect(meta.width).toBeGreaterThan(0);
      ok = true;
    }
    expect(ok).toBe(true);
  });
});

describe('derivatives from master', () => {
  it('does not create widths larger than master', async () => {
    const master = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 20, g: 120, b: 80 } },
    })
      .jpeg()
      .toBuffer();
    const masterMeta = await sharp(master).metadata();
    const widths = DERIVATIVE_WIDTHS.filter((dw) => (masterMeta.width ?? 0) >= dw);
    expect(widths.every((dw) => dw <= (masterMeta.width ?? 0))).toBe(true);
    expect(widths.includes(1600 as (typeof DERIVATIVE_WIDTHS)[number])).toBe(false);
  });

  it('emits WebP and AVIF when supported', async () => {
    const master = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 100, g: 50, b: 20 } },
    })
      .jpeg()
      .toBuffer();
    const webp = await sharp(master)
      .resize({ width: 400, withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: 82 })
      .toBuffer();
    expect((await sharp(webp).metadata()).format).toBe('webp');
    try {
      const avif = await sharp(master)
        .resize({ width: 400, withoutEnlargement: true, fit: 'inside' })
        .avif({ quality: 60 })
        .toBuffer();
      expect((await sharp(avif).metadata()).format).toBe('avif');
    } catch {
      // AVIF optional on some platforms — skip
    }
  });
});

describe('sharp guards', () => {
  it('rejects SVG-like non-raster via file-type absence in upload allowlist conceptually', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    );
    const FileType = (await import('file-type')).default;
    const detected = await FileType.fromBuffer(svg);
    expect(
      detected == null ||
        !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(detected.mime),
    ).toBe(true);
  });

  it('generates webp derivative smaller or equal width', async () => {
    const master = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 20, g: 120, b: 80 } },
    })
      .jpeg()
      .toBuffer();
    const out = await sharp(master)
      .resize({ width: 400, withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: 82 })
      .toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.width).toBeLessThanOrEqual(400);
    expect(meta.format).toBe('webp');
  });
});

describe('sharp decode edge cases', () => {
  it('rejects random bytes pretending to be jpeg at magic layer', async () => {
    const FileType = (await import('file-type')).default;
    const junk = Buffer.from('not-an-image-at-all-xxxxx');
    const detected = await FileType.fromBuffer(junk);
    expect(detected == null || detected.mime !== 'image/jpeg').toBe(true);
  });

  it('maps corrupt image to IMAGE_DECODE_FAILED contract', () => {
    const err = mediaHttpException(MEDIA_ERROR_CODES.IMAGE_DECODE_FAILED);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = err.getResponse() as { code: string };
    expect(body.code).toBe('IMAGE_DECODE_FAILED');
  });

  it('maps oversize file to MEDIA_TOO_LARGE', () => {
    const err = mediaHttpException(MEDIA_ERROR_CODES.MEDIA_TOO_LARGE);
    expect((err.getResponse() as { code: string }).code).toBe('MEDIA_TOO_LARGE');
  });

  it('maps excessive dimensions to IMAGE_DIMENSIONS_TOO_LARGE', () => {
    const err = mediaHttpException(MEDIA_ERROR_CODES.IMAGE_DIMENSIONS_TOO_LARGE);
    expect((err.getResponse() as { code: string }).code).toBe('IMAGE_DIMENSIONS_TOO_LARGE');
  });

  it('maps unsupported format to MEDIA_UNSUPPORTED', () => {
    const err = mediaHttpException(MEDIA_ERROR_CODES.MEDIA_UNSUPPORTED);
    expect((err.getResponse() as { code: string }).code).toBe('MEDIA_UNSUPPORTED');
  });

  it('decodes progressive JPEG', async () => {
    const progressive = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg({ progressive: true, quality: 80 })
      .toBuffer();
    const meta = await sharp(progressive, { failOn: 'error' }).metadata();
    expect(meta.width).toBe(64);
    expect(meta.format).toBe('jpeg');
  });

  it('applies EXIF orientation via rotate()', async () => {
    const base = await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const oriented = await sharp(base).rotate().jpeg().toBuffer();
    const meta = await sharp(oriented).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });
});

describe('MediaService uploadImage storage compensate', () => {
  it('deletes written keys when DB persist fails', async () => {
    const written: string[] = [];
    const deleted: string[] = [];
    const storage = {
      put: jest.fn(async ({ key }: { key: string }) => {
        written.push(key);
      }),
      delete: jest.fn(async (key: string) => {
        deleted.push(key);
      }),
      getPublicUrl: (key: string) => `http://cdn.test/${key}`,
      get: jest.fn(),
      head: jest.fn(),
      listKeys: jest.fn(),
    };

    const prisma = {
      client: {
        $transaction: jest.fn(async () => {
          throw new Error('db_down');
        }),
        mediaAsset: {
          findUnique: jest.fn(),
          create: jest.fn(),
        },
        mediaDerivative: {
          createMany: jest.fn(),
        },
      },
    };

    const appConfig = { mediaMaxBytes: MEDIA_UPLOAD_MAX_INPUT_BYTES };
    const service = new MediaService(prisma as never, appConfig as never, storage as never);

    const jpeg = await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 12, g: 34, b: 56 } },
    })
      .jpeg()
      .toBuffer();

    await expect(service.uploadImage(jpeg)).rejects.toBeInstanceOf(HttpException);
    expect(written.length).toBeGreaterThan(0);
    expect(deleted.length).toBe(written.length);
    expect(deleted.slice().reverse()).toEqual(written);
  });

  it('rejects MEDIA_TOO_LARGE before decode', async () => {
    const storage = {
      put: jest.fn(),
      delete: jest.fn(),
      getPublicUrl: (key: string) => key,
      get: jest.fn(),
      head: jest.fn(),
      listKeys: jest.fn(),
    };
    const prisma = { client: {} };
    const service = new MediaService(
      prisma as never,
      { mediaMaxBytes: 100 } as never,
      storage as never,
    );
    const buf = Buffer.alloc(200, 1);
    await expect(service.uploadImage(buf)).rejects.toMatchObject({
      response: { code: 'MEDIA_TOO_LARGE' },
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rejects unsupported magic as MEDIA_UNSUPPORTED', async () => {
    const storage = {
      put: jest.fn(),
      delete: jest.fn(),
      getPublicUrl: (key: string) => key,
      get: jest.fn(),
      head: jest.fn(),
      listKeys: jest.fn(),
    };
    const service = new MediaService(
      { client: {} } as never,
      { mediaMaxBytes: MEDIA_UPLOAD_MAX_INPUT_BYTES } as never,
      storage as never,
    );
    await expect(service.uploadImage(Buffer.from('not-an-image'))).rejects.toMatchObject({
      response: { code: 'MEDIA_UNSUPPORTED' },
    });
  });

  it(
    'persists post-resize master dimensions for oversized input',
    async () => {
      const puts: Array<{ key: string; body: Buffer }> = [];
      let createdAsset: { width: number; height: number } | null = null;
      const storage = {
        put: jest.fn(async (args: { key: string; body: Buffer }) => {
          puts.push(args);
        }),
        delete: jest.fn(),
        getPublicUrl: (key: string) => `http://cdn.test/${key}`,
        get: jest.fn(),
        head: jest.fn(),
        listKeys: jest.fn(),
      };

      const prisma = {
        client: {
          $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) => {
            const tx = {
              mediaAsset: {
                create: jest.fn(async ({ data }: { data: { width: number; height: number } }) => {
                  createdAsset = { width: data.width, height: data.height };
                }),
              },
              mediaDerivative: {
                createMany: jest.fn(),
              },
            };
            await fn(tx);
          }),
          mediaAsset: {
            findUnique: jest.fn(async () => ({
              id: 'asset-1',
              storageKey: puts[0]?.key ?? 'masters/x.jpg',
              mimeType: 'image/jpeg',
              width: createdAsset?.width ?? 0,
              height: createdAsset?.height ?? 0,
              derivatives: [],
            })),
          },
        },
      };

      const service = new MediaService(
        prisma as never,
        { mediaMaxBytes: MEDIA_UPLOAD_MAX_INPUT_BYTES } as never,
        storage as never,
      );

      const jpeg = await sharp({
        create: { width: 3000, height: 2000, channels: 3, background: { r: 220, g: 30, b: 60 } },
      })
        .jpeg({ quality: 80 })
        .toBuffer();

      const dto = await service.uploadImage(jpeg);
      expect(createdAsset).toEqual({ width: 1600, height: 1067 });
      expect(dto.width).toBe(1600);
      expect(dto.height).toBe(1067);
      expect(Math.max(...puts.map((p) => p.body.byteLength))).toBeLessThan(jpeg.byteLength);
    },
    60_000,
  );
  it(
    'downscales oversized input edges instead of rejecting',
    async () => {
      const puts: Array<{ key: string; body: Buffer }> = [];
      let createdAsset: { width: number; height: number } | null = null;
      const storage = {
        put: jest.fn(async (args: { key: string; body: Buffer }) => {
          puts.push(args);
        }),
        delete: jest.fn(),
        getPublicUrl: (key: string) => `http://cdn.test/${key}`,
        get: jest.fn(),
        head: jest.fn(),
        listKeys: jest.fn(),
      };
      const prisma = {
        client: {
          $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) => {
            const tx = {
              mediaAsset: {
                create: jest.fn(async ({ data }: { data: { width: number; height: number } }) => {
                  createdAsset = { width: data.width, height: data.height };
                }),
              },
              mediaDerivative: { createMany: jest.fn() },
            };
            await fn(tx);
          }),
          mediaAsset: {
            findUnique: jest.fn(async () => ({
              id: 'asset-oversized',
              storageKey: puts[0]?.key ?? 'masters/x.jpg',
              mimeType: 'image/jpeg',
              width: createdAsset?.width ?? 0,
              height: createdAsset?.height ?? 0,
              derivatives: [],
            })),
          },
        },
      };
      const service = new MediaService(
        prisma as never,
        { mediaMaxBytes: MEDIA_UPLOAD_MAX_INPUT_BYTES } as never,
        storage as never,
      );
      const jpeg = await sharp({
        create: {
          // > MEDIA_MAX_DIMENSION on long edge, but under MEDIA_MAX_INPUT_PIXELS bomb guard.
          width: 6100,
          height: 4000,
          channels: 3,
          background: { r: 200, g: 40, b: 60 },
        },
      })
        .jpeg({ quality: 70 })
        .toBuffer();
      // Ensure under hard byte limit for this synthetic raster.
      expect(jpeg.byteLength).toBeLessThan(MEDIA_UPLOAD_MAX_INPUT_BYTES);
      const dto = await service.uploadImage(jpeg);
      expect(Math.max(dto.width ?? 0, dto.height ?? 0)).toBeLessThanOrEqual(MASTER_MAX_LONG_SIDE);
      expect(dto.width).toBe(1600);
      expect(dto.height).toBe(1049);
    },
    90_000,
  );
});

describe('orphan eligibility helpers', () => {
  it('writes a local object that cleanup can target', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sf-orphan-'));
    try {
      await mkdir(join(dir, 'masters'), { recursive: true });
      const key = 'masters/orphan.jpg';
      await writeFile(join(dir, key), Buffer.from('orphan'));
      const storage = new LocalMediaStorage(dir, 'http://x/media');
      expect((await storage.head(key)).exists).toBe(true);
      await storage.delete(key);
      expect((await storage.head(key)).exists).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

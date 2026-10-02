/** Max product photos (server-side invariant). */
export const PRODUCT_MEDIA_MAX = 12;

/** Orphan MediaAsset grace before physical cleanup (hours). */
export const MEDIA_ORPHAN_GRACE_HOURS = 24;

/** Decompression-bomb guard: ~25MP covers high-res bouquet photography. */
export const MEDIA_MAX_INPUT_PIXELS = 25_000_000;

/**
 * Max edge of the *uploaded* raster after EXIF rotate.
 * Larger phone photos are safely downscaled to this edge before master encode
 * (not a hard reject — pixel-bomb guard remains MEDIA_MAX_INPUT_PIXELS).
 */
export const MEDIA_MAX_DIMENSION = 6000;

/**
 * Hard ceiling for a single upload body (Multer + MediaService + nginx body size).
 * Managers may select large phone photos; client may prepare first, but the
 * API still enforces this absolute byte limit.
 * Keep deploy/nginx client_max_body_size ≥ this value (see shopbuket1-proxy.inc).
 */
export const MEDIA_UPLOAD_MAX_INPUT_BYTES = 25_000_000;

/**
 * Web-ready master long side (max). Only downscales; never upscales.
 * Aspect ratio preserved via Sharp `fit: 'inside'`.
 */
export const MASTER_MAX_LONG_SIDE = 1600;

/** Responsive derivative ladder (no upscaling beyond source master). */
export const DERIVATIVE_WIDTHS = [400, 800, 1200, 1600] as const;

/**
 * Flower photography: fine texture + saturated color.
 * WebP 82 / AVIF 60 balances visual quality vs byte size.
 */
export const DERIVATIVE_WEBP_QUALITY = 82;
export const DERIVATIVE_AVIF_QUALITY = 60;

/** Normalized master encode quality (high — source for future regeneration). */
export const MASTER_JPEG_QUALITY = 92;
export const MASTER_WEBP_QUALITY = 90;
export const MASTER_AVIF_QUALITY = 80;

/** Bound concurrent Sharp pipelines inside one API process. */
export const MEDIA_PROCESS_CONCURRENCY = 2;

/** Admin upload throttle (authenticated). */
export const MEDIA_UPLOAD_THROTTLE = { limit: 30, ttl: 60_000 } as const;

/** Technical objects for storage connectivity probes (never product media). */
export const MEDIA_HEALTHCHECK_PREFIX = 'healthchecks/';

/** Alt text length bounds (Cyrillic allowed). */
export const MEDIA_ALT_MAX_LENGTH = 300;

/** Responsive derivative formats generated from the normalized master. */
export const DERIVATIVE_FORMATS = [
  { format: 'WEBP' as const, mime: 'image/webp', sharp: 'webp' as const },
  { format: 'AVIF' as const, mime: 'image/avif', sharp: 'avif' as const },
];

/**
 * Compute master pixel size after downscale-only fit to MASTER_MAX_LONG_SIDE.
 * Pure helper for tests and docs; Sharp uses the same scale rule via fit:'inside'.
 */
export function fitMasterDimensions(
  width: number,
  height: number,
  maxLongSide: number = MASTER_MAX_LONG_SIDE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const long = Math.max(width, height);
  if (long <= maxLongSide) return { width, height };
  const scale = maxLongSide / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

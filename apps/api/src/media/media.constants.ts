/** Max product photos (server-side invariant). */
export const PRODUCT_MEDIA_MAX = 12;

/** Orphan MediaAsset grace before physical cleanup (hours). */
export const MEDIA_ORPHAN_GRACE_HOURS = 24;

/** Decompression-bomb guard: ~25MP covers high-res bouquet photography. */
export const MEDIA_MAX_INPUT_PIXELS = 25_000_000;

/** Max edge after EXIF rotate — boutique product photos. */
export const MEDIA_MAX_DIMENSION = 6000;

/** Responsive derivative ladder (no upscaling beyond source). */
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

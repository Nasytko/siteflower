/**
 * Pick a public URL for catalog cards / OG from master + derivative rows.
 * Prefer AVIF → WebP at or above target width; fall back to master.
 */
export function pickDerivativeStorageUrl(
  masterStorageKey: string,
  derivatives: Array<{ width: number; format: string; storageKey: string }>,
  urlFor: (key: string) => string,
  targetWidth: number,
): string {
  if (derivatives.length === 0) return urlFor(masterStorageKey);

  const preferredFormats = ['AVIF', 'WEBP', 'JPEG', 'PNG'];
  const sorted = [...derivatives].sort((a, b) => a.width - b.width);

  for (const format of preferredFormats) {
    const candidates = sorted.filter((d) => d.format.toUpperCase() === format);
    const fit = candidates.find((d) => d.width >= targetWidth) ?? candidates.at(-1);
    if (fit) return urlFor(fit.storageKey);
  }

  const any = sorted.find((d) => d.width >= targetWidth) ?? sorted.at(-1);
  return any ? urlFor(any.storageKey) : urlFor(masterStorageKey);
}

/** Catalog card target (~2× of common 400px cell). */
export const LIST_IMAGE_TARGET_WIDTH = 800;

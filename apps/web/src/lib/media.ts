/**
 * Prefer media derivatives for cards / LCP without downloading masters.
 */

export type MediaDerivative = {
  width: number;
  format: string;
  url: string;
};

export type MediaLike = {
  url: string;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  derivatives?: MediaDerivative[];
};

/** Pick closest derivative at or above target width; prefer AVIF then WEBP. */
export function pickDerivativeUrl(
  media: MediaLike | null | undefined,
  targetWidth: number,
): string | null {
  if (!media) return null;
  const derivatives = media.derivatives ?? [];
  if (derivatives.length === 0) return media.url;

  const preferredFormats = ['AVIF', 'WEBP', 'JPEG', 'PNG'];
  const sorted = [...derivatives].sort((a, b) => a.width - b.width);

  for (const format of preferredFormats) {
    const candidates = sorted.filter((d) => d.format.toUpperCase() === format);
    const fit = candidates.find((d) => d.width >= targetWidth) ?? candidates.at(-1);
    if (fit) return fit.url;
  }

  return sorted.find((d) => d.width >= targetWidth)?.url ?? sorted.at(-1)?.url ?? media.url;
}

export function formatPriceFromMinor(amountMinor: string, currency = 'BYN'): string {
  const value = BigInt(amountMinor);
  const whole = value / 100n;
  const fraction = value % 100n;
  return `${whole.toString()},${fraction.toString().padStart(2, '0')} ${currency}`;
}

/**
 * Prefer same-origin `/api/v1/media/...` paths so Admin `<img>` loads via the
 * Next rewrite and is not blocked by API Cross-Origin-Resource-Policy.
 */
export function toSameOriginMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'http://local.invalid');
    if (parsed.pathname.startsWith('/api/v1/media/')) {
      return `${parsed.pathname}${parsed.search}`;
    }
    return url;
  } catch {
    return url;
  }
}

/** BYN price band presets for catalog UI (customer thinks in major units). */
export const PRICE_BANDS = [
  { id: 'under-100', label: 'До 100 BYN', minMinor: undefined, maxMinor: '10000' },
  { id: '100-150', label: '100–150 BYN', minMinor: '10000', maxMinor: '15000' },
  { id: '150-200', label: '150–200 BYN', minMinor: '15000', maxMinor: '20000' },
  { id: '200-plus', label: '200+ BYN', minMinor: '20000', maxMinor: undefined },
] as const;

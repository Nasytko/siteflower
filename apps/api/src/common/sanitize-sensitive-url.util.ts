/**
 * Redact sensitive path segments before logging or returning in error bodies.
 * Tracking bearer tokens live in `/orders/track/:token`.
 */
export function sanitizeSensitiveUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/\/orders\/track\/[^/?#]+/gi, '/orders/track/[REDACTED]');
}

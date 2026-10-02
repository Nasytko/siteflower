/**
 * Build-time helpers for next/image remote allowlisting and size ladders.
 *
 * Media object URLs are absolute (S3 / local media base). next/image only
 * accepts hosts listed in `images.remotePatterns`, which are frozen into the
 * Next build — Docker must pass S3_PUBLIC_BASE_URL (or MEDIA_PUBLIC_BASE_URL)
 * as a build-arg. Credentials never belong here or in NEXT_PUBLIC_*.
 */

/** Matches API DERIVATIVE_WIDTHS + master long side (no 1920+ optimizer widths). */
export const STOREFRONT_IMAGE_DEVICE_SIZES = [400, 800, 1200, 1600] as const;

/** Thumb / icon ladder for next/image `imageSizes`. */
export const STOREFRONT_IMAGE_SIZES = [16, 32, 48, 64, 96, 128, 256, 384] as const;

export type MediaRemotePattern = {
  protocol: 'http' | 'https';
  hostname: string;
  port?: string;
  pathname: string;
};

export type MediaImageEnv = {
  MEDIA_PUBLIC_BASE_URL?: string;
  S3_PUBLIC_BASE_URL?: string;
  API_URL?: string;
  NODE_ENV?: string;
  ALLOW_LOCAL_IMAGE_IP?: string;
  /** Set true in production Docker web builds — fail if media origin is missing/local. */
  REQUIRE_MEDIA_REMOTE_ORIGIN?: string;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  // Docker Compose service DNS (api:3001) is never a browser media origin.
  if (host === 'api' || host === 'web') return true;
  return false;
}

export function resolveCanonicalMediaPublicBase(env: MediaImageEnv): string | null {
  const raw = (env.S3_PUBLIC_BASE_URL ?? env.MEDIA_PUBLIC_BASE_URL ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return raw.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** Parse a single public base URL into a tight remotePattern (path-scoped when possible). */
export function toMediaRemotePattern(raw: string): MediaRemotePattern | null {
  try {
    const url = new URL(raw);
    const protocol = url.protocol.replace(':', '') as 'http' | 'https';
    if (protocol !== 'http' && protocol !== 'https') return null;
    if (!url.hostname) return null;

    const basePath = url.pathname.replace(/\/$/, '');
    const pathname = !basePath || basePath === '' ? '/**' : `${basePath}/**`;

    return {
      protocol,
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      pathname,
    };
  } catch {
    return null;
  }
}

function patternKey(pattern: MediaRemotePattern): string {
  return `${pattern.protocol}://${pattern.hostname}:${pattern.port ?? ''}${pattern.pathname}`;
}

function allowLocalImageIp(env: MediaImageEnv): boolean {
  if (env.ALLOW_LOCAL_IMAGE_IP === 'true') return true;
  return (env.NODE_ENV ?? 'development') !== 'production';
}

function requireMediaRemoteOrigin(env: MediaImageEnv): boolean {
  return env.REQUIRE_MEDIA_REMOTE_ORIGIN === 'true';
}

/**
 * Canonical remotePatterns for next/image — only our media (+ optional local/dev API).
 * Never uses wildcards like hostname "**".
 */
export function buildMediaRemotePatterns(env: MediaImageEnv): MediaRemotePattern[] {
  const patterns: MediaRemotePattern[] = [];
  const seen = new Set<string>();

  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    const pattern = toMediaRemotePattern(raw);
    if (!pattern) return;
    const key = patternKey(pattern);
    if (seen.has(key)) return;
    seen.add(key);
    patterns.push(pattern);
  };

  const mediaBase = resolveCanonicalMediaPublicBase(env);
  if (requireMediaRemoteOrigin(env)) {
    if (!mediaBase) {
      throw new Error(
        'REQUIRE_MEDIA_REMOTE_ORIGIN=true but S3_PUBLIC_BASE_URL / MEDIA_PUBLIC_BASE_URL is missing. ' +
          'Pass the public HTTPS media origin as a Docker build-arg so next/image can allow it.',
      );
    }
    const pattern = toMediaRemotePattern(mediaBase);
    if (!pattern || isLocalHostname(pattern.hostname)) {
      throw new Error(
        `REQUIRE_MEDIA_REMOTE_ORIGIN=true rejects local/invalid media origin (${mediaBase}). ` +
          'Set S3_PUBLIC_BASE_URL to the browser-reachable HTTPS base (e.g. https://s3.example.com/bucket).',
      );
    }
    if (pattern.protocol !== 'https') {
      throw new Error(
        `REQUIRE_MEDIA_REMOTE_ORIGIN=true requires https:// media origin, got ${mediaBase}`,
      );
    }
    push(mediaBase);
    return patterns;
  }

  // Local / CI: media base (may be API media route) + optional loopback helpers.
  push(mediaBase ?? 'http://127.0.0.1:3001/api/v1/media');
  if (allowLocalImageIp(env)) {
    push(env.API_URL ?? 'http://127.0.0.1:3001');
    push('http://localhost:3001');
    push('http://127.0.0.1:3001');
  }

  return patterns;
}

function effectivePort(protocol: 'http' | 'https', port: string): string {
  if (port) return port;
  return protocol === 'https' ? '443' : '80';
}

/** Whether next/image would accept this absolute URL under the given patterns. */
export function isMediaUrlAllowedByRemotePatterns(
  absoluteUrl: string,
  patterns: MediaRemotePattern[],
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(absoluteUrl);
  } catch {
    return false;
  }
  const protocol = parsed.protocol.replace(':', '') as 'http' | 'https';
  if (protocol !== 'http' && protocol !== 'https') return false;

  const urlPort = effectivePort(protocol, parsed.port);

  return patterns.some((pattern) => {
    if (pattern.protocol !== protocol) return false;
    if (pattern.hostname !== parsed.hostname) return false;

    if (pattern.port) {
      if (effectivePort(protocol, pattern.port) !== urlPort) return false;
    } else if (parsed.port) {
      // Pattern omits port → reject explicit non-default ports on the URL.
      return false;
    }

    const pathPattern = pattern.pathname;
    if (pathPattern === '/**') return true;
    if (pathPattern.endsWith('/**')) {
      const prefix = pathPattern.slice(0, -3);
      return parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`);
    }
    return parsed.pathname === pathPattern;
  });
}

export function shouldAllowLocalImageIp(env: MediaImageEnv): boolean {
  return allowLocalImageIp(env);
}

import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3001';
const mediaPublicBase =
  process.env.MEDIA_PUBLIC_BASE_URL ??
  process.env.S3_PUBLIC_BASE_URL ??
  'http://127.0.0.1:3001/api/v1/media';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const allowLocalImageIp =
  nodeEnv !== 'production' || process.env.ALLOW_LOCAL_IMAGE_IP === 'true';

function toRemotePattern(raw: string): {
  protocol: 'http' | 'https';
  hostname: string;
  port?: string;
  pathname: string;
} | null {
  try {
    const url = new URL(raw);
    const protocol = url.protocol.replace(':', '') as 'http' | 'https';
    if (protocol !== 'http' && protocol !== 'https') return null;
    return {
      protocol,
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      pathname: '/**',
    };
  } catch {
    return null;
  }
}

const remotePatterns = [
  toRemotePattern(apiUrl),
  ...(allowLocalImageIp
    ? [toRemotePattern('http://localhost:3001'), toRemotePattern('http://127.0.0.1:3001')]
    : []),
  toRemotePattern(mediaPublicBase),
].filter((p): p is NonNullable<typeof p> => Boolean(p));

// Deduplicate by host+port+protocol
const seen = new Set<string>();
const uniquePatterns = remotePatterns.filter((pattern) => {
  const key = `${pattern.protocol}://${pattern.hostname}:${pattern.port ?? ''}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@bouquet-one/ui'],
  // Tree-shake barrel imports from the shared UI package.
  experimental: {
    optimizePackageImports: ['@bouquet-one/ui'],
  },
  images: {
    remotePatterns: uniquePatterns,
    // Local MEDIA_PUBLIC_BASE_URL points at 127.0.0.1 during development.
    // Production must not need this unless explicitly opted in.
    ...(allowLocalImageIp ? { dangerouslyAllowLocalIP: true } : {}),
    formats: ['image/avif', 'image/webp'],
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/order/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/checkout',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/cart',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/order/success',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;

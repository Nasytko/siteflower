import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3001';
const mediaPublicBase =
  process.env.MEDIA_PUBLIC_BASE_URL ??
  process.env.S3_PUBLIC_BASE_URL ??
  'http://127.0.0.1:3001/api/v1/media';

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
  toRemotePattern('http://localhost:3001'),
  toRemotePattern('http://127.0.0.1:3001'),
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
  transpilePackages: ['@bouquet-one/ui', '@bouquet-one/contracts'],
  images: {
    remotePatterns: uniquePatterns,
    // Local MEDIA_PUBLIC_BASE_URL points at 127.0.0.1 during development.
    dangerouslyAllowLocalIP: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

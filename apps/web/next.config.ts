import type { NextConfig } from 'next';
import {
  STOREFRONT_IMAGE_DEVICE_SIZES,
  STOREFRONT_IMAGE_SIZES,
  buildMediaRemotePatterns,
  shouldAllowLocalImageIp,
  type MediaImageEnv,
} from './src/lib/media-image-config';

const imageEnv: MediaImageEnv = {
  MEDIA_PUBLIC_BASE_URL: process.env.MEDIA_PUBLIC_BASE_URL,
  S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
  API_URL: process.env.API_URL,
  NODE_ENV: process.env.NODE_ENV,
  ALLOW_LOCAL_IMAGE_IP: process.env.ALLOW_LOCAL_IMAGE_IP,
  REQUIRE_MEDIA_REMOTE_ORIGIN: process.env.REQUIRE_MEDIA_REMOTE_ORIGIN,
};

const uniquePatterns = buildMediaRemotePatterns(imageEnv);
const allowLocalImageIp = shouldAllowLocalImageIp(imageEnv);

/** Keep in sync with packages/contracts/src/public-routes.ts LEGACY_PATH_REDIRECTS. */
const LEGACY_PATH_REDIRECTS: Array<{
  source: string;
  destination: string;
  permanent: true;
}> = [
  { source: '/bukety', destination: '/catalog/bouquets', permanent: true },
  { source: '/bukety/:slug', destination: '/products/:slug', permanent: true },
  { source: '/katalog', destination: '/catalog', permanent: true },
  { source: '/katalog/:slug', destination: '/catalog/:slug', permanent: true },
  { source: '/cvety', destination: '/catalog/stems', permanent: true },
  { source: '/cvety/:slug', destination: '/catalog/bouquets?flower=:slug', permanent: true },
  { source: '/p/:slug', destination: '/catalog/:slug', permanent: true },
  { source: '/collections', destination: '/catalog/bouquets', permanent: true },
  { source: '/collections/:slug', destination: '/catalog/bouquets', permanent: true },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Production Docker images copy a minimal server bundle (see deploy/Dockerfile.web).
  output: 'standalone',
  transpilePackages: ['@bouquet-one/ui'],
  // Tree-shake barrel imports from the shared UI package.
  experimental: {
    optimizePackageImports: ['@bouquet-one/ui'],
  },
  images: {
    // Only our canonical media origin(s) — never hostname "**" / arbitrary remotes.
    remotePatterns: uniquePatterns,
    // Align optimizer widths with Sharp derivative ladder (400/800/1200/1600).
    deviceSizes: [...STOREFRONT_IMAGE_DEVICE_SIZES],
    imageSizes: [...STOREFRONT_IMAGE_SIZES],
    // Local MEDIA_PUBLIC_BASE_URL points at 127.0.0.1 during development.
    // Production must not need this unless explicitly opted in.
    ...(allowLocalImageIp ? { dangerouslyAllowLocalIP: true } : {}),
    formats: ['image/avif', 'image/webp'],
  },
  async rewrites() {
    const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3001';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      ...LEGACY_PATH_REDIRECTS,
      {
        source: '/catalog/bouquets',
        has: [{ type: 'query', key: 'featured' }],
        destination: '/akcii',
        permanent: true,
      },
      { source: '/catalog/bukety', destination: '/catalog/bouquets', permanent: true },
      { source: '/catalog/tsvety', destination: '/catalog/stems', permanent: true },
      { source: '/catalog/cvety', destination: '/catalog/stems', permanent: true },
      { source: '/catalog/rozy', destination: '/catalog/roses', permanent: true },
      { source: '/catalog/monobukety', destination: '/catalog/mono-bouquets', permanent: true },
      {
        source: '/catalog/bukety-iz-roz',
        destination: '/catalog/rose-bouquets',
        permanent: true,
      },
      {
        source: '/catalog/bukety-s-rozami',
        destination: '/catalog/bouquets-with-roses',
        permanent: true,
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

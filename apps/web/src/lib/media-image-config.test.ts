import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STOREFRONT_IMAGE_DEVICE_SIZES,
  STOREFRONT_IMAGE_SIZES,
  buildMediaRemotePatterns,
  isLocalHostname,
  isMediaUrlAllowedByRemotePatterns,
  resolveCanonicalMediaPublicBase,
  toMediaRemotePattern,
} from './media-image-config';

test('canonical media base prefers S3_PUBLIC_BASE_URL over MEDIA_PUBLIC_BASE_URL', () => {
  assert.equal(
    resolveCanonicalMediaPublicBase({
      S3_PUBLIC_BASE_URL: 'https://s3.hostfly.by/shopbuket1-media',
      MEDIA_PUBLIC_BASE_URL: 'http://127.0.0.1:3001/api/v1/media',
    }),
    'https://s3.hostfly.by/shopbuket1-media',
  );
});

test('toMediaRemotePattern scopes pathname to bucket prefix', () => {
  assert.deepEqual(toMediaRemotePattern('https://s3.hostfly.by/shopbuket1-media'), {
    protocol: 'https',
    hostname: 's3.hostfly.by',
    pathname: '/shopbuket1-media/**',
  });
});

test('production Docker patterns allow only canonical S3 host (no wildcards)', () => {
  const patterns = buildMediaRemotePatterns({
    NODE_ENV: 'production',
    REQUIRE_MEDIA_REMOTE_ORIGIN: 'true',
    S3_PUBLIC_BASE_URL: 'https://s3.hostfly.by/shopbuket1-media',
    API_URL: 'http://api:3001',
  });
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0]?.hostname, 's3.hostfly.by');
  assert.equal(patterns[0]?.protocol, 'https');
  assert.equal(patterns[0]?.pathname, '/shopbuket1-media/**');
  assert.ok(!patterns.some((p) => p.hostname === '**' || p.hostname.includes('*')));
});

test('production Docker build fails without media origin', () => {
  assert.throws(
    () =>
      buildMediaRemotePatterns({
        NODE_ENV: 'production',
        REQUIRE_MEDIA_REMOTE_ORIGIN: 'true',
      }),
    /S3_PUBLIC_BASE_URL/,
  );
});

test('production Docker build rejects localhost media origin', () => {
  assert.throws(
    () =>
      buildMediaRemotePatterns({
        NODE_ENV: 'production',
        REQUIRE_MEDIA_REMOTE_ORIGIN: 'true',
        MEDIA_PUBLIC_BASE_URL: 'http://127.0.0.1:3001/api/v1/media',
      }),
    /rejects local/,
  );
});

test('allowed: derivative AVIF/WebP under canonical origin', () => {
  const patterns = buildMediaRemotePatterns({
    REQUIRE_MEDIA_REMOTE_ORIGIN: 'true',
    S3_PUBLIC_BASE_URL: 'https://s3.hostfly.by/shopbuket1-media',
  });
  assert.equal(
    isMediaUrlAllowedByRemotePatterns(
      'https://s3.hostfly.by/shopbuket1-media/derivatives/abc/w1200.avif',
      patterns,
    ),
    true,
  );
  assert.equal(
    isMediaUrlAllowedByRemotePatterns(
      'https://s3.hostfly.by/shopbuket1-media/derivatives/abc/w800.webp',
      patterns,
    ),
    true,
  );
});

test('forbidden: arbitrary remote hostname', () => {
  const patterns = buildMediaRemotePatterns({
    REQUIRE_MEDIA_REMOTE_ORIGIN: 'true',
    S3_PUBLIC_BASE_URL: 'https://s3.hostfly.by/shopbuket1-media',
  });
  assert.equal(
    isMediaUrlAllowedByRemotePatterns('https://evil.example/steal.jpg', patterns),
    false,
  );
  assert.equal(
    isMediaUrlAllowedByRemotePatterns(
      'https://cdn.other-cloud.com/shopbuket1-media/derivatives/x/w1200.avif',
      patterns,
    ),
    false,
  );
});

test('forbidden: same host but outside public base path', () => {
  const patterns = buildMediaRemotePatterns({
    REQUIRE_MEDIA_REMOTE_ORIGIN: 'true',
    S3_PUBLIC_BASE_URL: 'https://s3.hostfly.by/shopbuket1-media',
  });
  assert.equal(
    isMediaUrlAllowedByRemotePatterns('https://s3.hostfly.by/other-bucket/secret.jpg', patterns),
    false,
  );
});

test('storefront optimizer widths match derivative ladder (no 1920)', () => {
  assert.deepEqual([...STOREFRONT_IMAGE_DEVICE_SIZES], [400, 800, 1200, 1600]);
  assert.ok(!STOREFRONT_IMAGE_DEVICE_SIZES.includes(1920 as never));
  assert.ok(STOREFRONT_IMAGE_SIZES.includes(256));
});

test('isLocalHostname covers loopback and compose DNS', () => {
  assert.equal(isLocalHostname('127.0.0.1'), true);
  assert.equal(isLocalHostname('localhost'), true);
  assert.equal(isLocalHostname('api'), true);
  assert.equal(isLocalHostname('s3.hostfly.by'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPriceFromMinor,
  pickDerivativeUrl,
  toSameOriginMediaUrl,
  type MediaLike,
} from './media';

test('pickDerivativeUrl falls back to master when no derivatives', () => {
  const media: MediaLike = { url: 'http://localhost/media/masters/a.jpg' };
  assert.equal(pickDerivativeUrl(media, 400), media.url);
  assert.equal(pickDerivativeUrl(null, 400), null);
});

test('pickDerivativeUrl prefers AVIF then WEBP at or above target width', () => {
  const media: MediaLike = {
    url: 'http://localhost/media/masters/a.jpg',
    derivatives: [
      { width: 400, format: 'WEBP', url: '/w400.webp' },
      { width: 800, format: 'WEBP', url: '/w800.webp' },
      { width: 400, format: 'AVIF', url: '/w400.avif' },
      { width: 800, format: 'AVIF', url: '/w800.avif' },
    ],
  };
  assert.equal(pickDerivativeUrl(media, 500), '/w800.avif');
  assert.equal(pickDerivativeUrl(media, 200), '/w400.avif');
});

test('formatPriceFromMinor formats BYN minor units', () => {
  assert.equal(formatPriceFromMinor('11900'), '119,00 BYN');
  assert.equal(formatPriceFromMinor('99'), '0,99 BYN');
});

test('toSameOriginMediaUrl rewrites absolute media URLs to path-only', () => {
  assert.equal(
    toSameOriginMediaUrl('http://127.0.0.1:3001/api/v1/media/masters/a.jpg'),
    '/api/v1/media/masters/a.jpg',
  );
  assert.equal(toSameOriginMediaUrl('/api/v1/media/masters/a.jpg'), '/api/v1/media/masters/a.jpg');
  assert.equal(toSameOriginMediaUrl('https://cdn.example/img.jpg'), 'https://cdn.example/img.jpg');
  assert.equal(toSameOriginMediaUrl(null), null);
});

test('productImageAlt uses product name without SEO spam', async () => {
  const { productImageAlt } = await import('./media');
  assert.equal(productImageAlt('Амели', null), 'Букет «Амели»');
  assert.equal(productImageAlt('Амели', '  Пионы  '), 'Пионы');
});

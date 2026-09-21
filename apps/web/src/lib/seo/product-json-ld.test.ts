import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductPublicDto } from '@bouquet-one/contracts';
import { buildProductJsonLd } from './product-json-ld';

function baseProduct(overrides: Partial<ProductPublicDto> = {}): ProductPublicDto {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'ameli',
    name: 'Амели',
    shortDescription: 'Нежный букет',
    description: null,
    availability: 'AVAILABLE',
    featured: true,
    currency: 'BYN',
    price: { currency: 'BYN', minMinor: '8900', maxMinor: '14900', single: false, label: 'от 89,00 BYN' },
    seo: {
      seoTitle: null,
      seoDescription: null,
      noIndex: false,
      resolvedTitle: 'Амели',
      resolvedDescription: 'Нежный букет',
    },
    variants: [
      { id: 'v1', name: 'S', priceMinor: '8900', sortOrder: 0 },
      { id: 'v2', name: 'M', priceMinor: '11900', sortOrder: 1 },
      { id: 'v3', name: 'L', priceMinor: '14900', sortOrder: 2 },
    ],
    components: [],
    media: [],
    categories: [],
    occasions: [],
    recipients: [],
    styles: [],
    colors: [],
    ...overrides,
  };
}

test('buildProductJsonLd uses AggregateOffer for multiple variants', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  const jsonLd = buildProductJsonLd(baseProduct());
  const offers = jsonLd.offers as Record<string, unknown>;
  assert.equal(offers['@type'], 'AggregateOffer');
  assert.equal(offers.lowPrice, '89.00');
  assert.equal(offers.highPrice, '149.00');
  assert.equal(offers.offerCount, 3);
  assert.equal(offers.availability, 'https://schema.org/InStock');
});

test('buildProductJsonLd uses Offer for a single variant', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  const jsonLd = buildProductJsonLd(
    baseProduct({
      variants: [{ id: 'v1', name: 'M', priceMinor: '11900', sortOrder: 0 }],
      price: { currency: 'BYN', minMinor: '11900', maxMinor: '11900', single: true, label: '119,00 BYN' },
    }),
  );
  const offers = jsonLd.offers as Record<string, unknown>;
  assert.equal(offers['@type'], 'Offer');
  assert.equal(offers.price, '119.00');
  assert.equal(offers.availability, 'https://schema.org/InStock');
});

test('buildProductJsonLd maps commercial availability truthfully', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

  const cases: Array<[ProductPublicDto['availability'], string]> = [
    ['AVAILABLE', 'https://schema.org/InStock'],
    ['PREORDER', 'https://schema.org/PreOrder'],
    ['SEASONAL', 'https://schema.org/LimitedAvailability'],
    ['TEMPORARILY_UNAVAILABLE', 'https://schema.org/OutOfStock'],
  ];

  for (const [availability, expected] of cases) {
    const jsonLd = buildProductJsonLd(
      baseProduct({
        availability,
        variants: [{ id: 'v1', name: 'M', priceMinor: '10000', sortOrder: 0 }],
      }),
    );
    const offers = jsonLd.offers as Record<string, unknown>;
    assert.equal(offers.availability, expected, availability);
  }
});

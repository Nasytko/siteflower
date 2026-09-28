import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductPublicDto } from '@bouquet-one/contracts';
import { buildProductJsonLd } from './product-json-ld';

function priceRange(minMinor: string, maxMinor: string) {
  return {
    currency: 'BYN',
    minMinor,
    maxMinor,
    single: minMinor === maxMinor,
    label: minMinor === maxMinor ? '119,00 BYN' : `от ${Number(minMinor) / 100},00 BYN`,
  };
}

function variant(id: string, name: string, priceMinor: string, sortOrder: number, saleMinor?: string) {
  return {
    id,
    name,
    priceMinor,
    effectivePriceMinor: saleMinor ?? priceMinor,
    sortOrder,
  };
}

function baseProduct(overrides: Partial<ProductPublicDto> = {}): ProductPublicDto {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'ameli',
    name: 'Амели',
    shortDescription: 'Нежный букет',
    description: null,
    availability: 'AVAILABLE',
    heightCm: null,
    bouquetSize: null,
    currency: 'BYN',
    price: priceRange('8900', '14900'),
    promotion: null,
    seo: {
      seoTitle: null,
      seoDescription: null,
      noIndex: false,
      resolvedTitle: 'Амели',
      resolvedDescription: 'Нежный букет',
    },
    variants: [
      variant('v1', 'S', '8900', 0),
      variant('v2', 'M', '11900', 1),
      variant('v3', 'L', '14900', 2),
    ],
    components: [],
    media: [],
    occasions: [],
    recipients: [],
    colors: [],
    productLines: [],
    flowers: [],
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
      variants: [variant('v1', 'M', '11900', 0)],
      price: priceRange('11900', '11900'),
    }),
  );
  const offers = jsonLd.offers as Record<string, unknown>;
  assert.equal(offers['@type'], 'Offer');
  assert.equal(offers.price, '119.00');
  assert.equal(offers.availability, 'https://schema.org/InStock');
});

test('buildProductJsonLd advertises the promotional price, not the regular one', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  const jsonLd = buildProductJsonLd(
    baseProduct({
      variants: [variant('v1', 'M', '11900', 0, '8900')],
      price: priceRange('11900', '11900'),
      promotion: {
        type: 'PERCENT',
        percentOff: 25,
        originalPrice: priceRange('11900', '11900'),
        salePrice: priceRange('8900', '8900'),
      },
    }),
  );
  const offers = jsonLd.offers as Record<string, unknown>;
  assert.equal(offers.price, '89.00');
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
        variants: [variant('v1', 'M', '10000', 0)],
      }),
    );
    const offers = jsonLd.offers as Record<string, unknown>;
    assert.equal(offers.availability, expected, availability);
  }
});

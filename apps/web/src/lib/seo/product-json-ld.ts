import type { ProductPublicDto } from '@bouquet-one/contracts';
import { buildJsonLd, type JsonLd } from './json-ld';
import { absoluteUrl } from './site-url';
import { pickDerivativeUrl } from '@/lib/media';

function mapAvailability(availability: ProductPublicDto['availability']): string {
  switch (availability) {
    case 'AVAILABLE':
      return 'https://schema.org/InStock';
    case 'PREORDER':
      return 'https://schema.org/PreOrder';
    case 'SEASONAL':
      return 'https://schema.org/LimitedAvailability';
    case 'TEMPORARILY_UNAVAILABLE':
      return 'https://schema.org/OutOfStock';
    default:
      return 'https://schema.org/InStock';
  }
}

/**
 * Product JSON-LD — truthful commercial availability, never warehouse stock.
 * Prices are the effective (post-promotion) amounts a customer actually pays.
 */
export function buildProductJsonLd(product: ProductPublicDto): JsonLd {
  const url = absoluteUrl(`/bukety/${product.slug}`);
  const images = product.media
    .map((m) => pickDerivativeUrl(m, 1200) ?? m.url)
    .filter(Boolean);
  const activeVariants = product.variants;
  const effectiveRange = product.promotion?.salePrice ?? product.price;

  const offers =
    activeVariants.length <= 1
      ? {
          '@type': 'Offer',
          url,
          priceCurrency: product.currency,
          price: minorToDecimal(
            activeVariants[0]?.effectivePriceMinor ?? effectiveRange.minMinor,
          ),
          availability: mapAvailability(product.availability),
          itemCondition: 'https://schema.org/NewCondition',
        }
      : {
          '@type': 'AggregateOffer',
          url,
          priceCurrency: product.currency,
          lowPrice: minorToDecimal(effectiveRange.minMinor),
          highPrice: minorToDecimal(effectiveRange.maxMinor),
          offerCount: activeVariants.length,
          availability: mapAvailability(product.availability),
          offers: activeVariants.map((variant) => ({
            '@type': 'Offer',
            name: variant.name,
            priceCurrency: product.currency,
            price: minorToDecimal(variant.effectivePriceMinor),
            availability: mapAvailability(product.availability),
            url,
          })),
        };

  return buildJsonLd({
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    image: images.length > 0 ? images : undefined,
    brand: {
      '@type': 'Brand',
      name: 'BUKET №1',
    },
    sku: product.slug,
    url,
    offers,
  });
}

export function buildBreadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
): JsonLd {
  return buildJsonLd({
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  });
}

function minorToDecimal(amountMinor: string): string {
  const value = BigInt(amountMinor);
  const whole = value / 100n;
  const fraction = value % 100n;
  return `${whole.toString()}.${fraction.toString().padStart(2, '0')}`;
}

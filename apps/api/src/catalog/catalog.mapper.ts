/**
 * Prisma row → DTO mapping for the catalog.
 * Media URLs arrive through a resolver so mapping stays free of storage details.
 */
import type { Prisma } from '@bouquet-one/database';
import {
  defaultProductSeoDescription,
  defaultProductSeoTitle,
  derivePriceRange,
  type CollectionAdminDto,
  type CollectionPublicDto,
  type CollectionRulesDto,
  type CommercialAvailability,
  type PriceRangeDto,
  type ProductAdminDto,
  type ProductListItemDto,
  type ProductMediaDto,
  type ProductPublicDto,
  type SeoFieldsDto,
  type TaxonomyAdminDto,
  type TaxonomyPublicDto,
  type TaxonomyRefDto,
  type TaxonomyVisibility,
} from '@bouquet-one/contracts';
import { activeVariantPrices } from './catalog.logic';

export type MediaUrlResolver = (storageKey: string) => string;

export const PRODUCT_INCLUDE = {
  variants: { orderBy: { sortOrder: 'asc' } },
  components: { orderBy: { sortOrder: 'asc' }, include: { flower: true } },
  media: {
    orderBy: { sortOrder: 'asc' },
    include: { mediaAsset: { include: { derivatives: { orderBy: { width: 'asc' } } } } },
  },
  categories: { include: { category: true } },
  occasions: { include: { occasion: true } },
  recipients: { include: { recipient: true } },
  styles: { include: { style: true } },
  colors: { include: { color: true } },
} satisfies Prisma.ProductInclude;

export const COLLECTION_INCLUDE = {
  products: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.CollectionInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;
export type CollectionWithProducts = Prisma.CollectionGetPayload<{
  include: typeof COLLECTION_INCLUDE;
}>;

/** Shared shape of every taxonomy table (flowers, categories, occasions, …). */
export type TaxonomyRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  version: number;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function toTaxonomyRef(row: { id: string; slug: string; name: string }): TaxonomyRefDto {
  return { id: row.id, slug: row.slug, name: row.name };
}

export function toTaxonomyAdminDto(row: TaxonomyRecord): TaxonomyAdminDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    visibility: row.visibility,
    version: row.version,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    noIndex: row.noIndex,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTaxonomyPublicDto(
  row: TaxonomyRecord,
  kind: TaxonomyPublicDto['kind'],
): TaxonomyPublicDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind,
    seo: {
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      noIndex: row.noIndex,
      resolvedTitle: row.seoTitle ?? `${row.name} | БУКЕТ №1`,
      resolvedDescription:
        row.seoDescription ??
        row.description ??
        `${row.name} — доставка цветов по Гродно | БУКЕТ №1`,
    },
  };
}

function toProductSeo(product: ProductWithRelations): SeoFieldsDto {
  return {
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    noIndex: product.noIndex,
    resolvedTitle: product.seoTitle ?? defaultProductSeoTitle(product.name),
    resolvedDescription:
      product.seoDescription ??
      defaultProductSeoDescription(product.name, product.shortDescription),
  };
}

function toCollectionSeo(collection: CollectionWithProducts): SeoFieldsDto {
  return {
    seoTitle: collection.seoTitle,
    seoDescription: collection.seoDescription,
    noIndex: collection.noIndex,
    resolvedTitle: collection.seoTitle ?? `${collection.name} | БУКЕТ №1`,
    resolvedDescription:
      collection.seoDescription ??
      collection.description ??
      `Подборка «${collection.name}» — доставка цветов по Гродно.`,
  };
}

export function toProductMediaDto(
  media: ProductWithRelations['media'][number],
  urlFor: MediaUrlResolver,
): ProductMediaDto {
  return {
    id: media.id,
    mediaAssetId: media.mediaAssetId,
    sortOrder: media.sortOrder,
    isPrimary: media.isPrimary,
    alt: media.alt,
    caption: media.caption,
    url: urlFor(media.mediaAsset.storageKey),
    width: media.mediaAsset.width,
    height: media.mediaAsset.height,
    mimeType: media.mediaAsset.mimeType,
    derivatives: media.mediaAsset.derivatives.map((derivative) => ({
      width: derivative.width,
      format: derivative.format,
      url: urlFor(derivative.storageKey),
    })),
  };
}

function primaryMedia(product: ProductWithRelations) {
  return product.media.find((item) => item.isPrimary) ?? product.media[0] ?? null;
}

export function toProductAdminDto(
  product: ProductWithRelations,
  urlFor: MediaUrlResolver,
): ProductAdminDto {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    lifecycle: product.lifecycle,
    availability: product.availability,
    featured: product.featured,
    currency: product.currency,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    publishAt: product.publishAt?.toISOString() ?? null,
    unpublishAt: product.unpublishAt?.toISOString() ?? null,
    version: product.version,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    noIndex: product.noIndex,
    seo: toProductSeo(product),
    price: activeVariantPrices(product.currency, product.variants),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      priceMinor: variant.priceMinor.toString(),
      sortOrder: variant.sortOrder,
      status: variant.status,
    })),
    components: product.components.map((component) => ({
      id: component.id,
      flowerId: component.flowerId,
      flower: component.flower ? toTaxonomyRef(component.flower) : null,
      displayName: component.displayName,
      quantity: component.quantity,
      unit: component.unit,
      sortOrder: component.sortOrder,
    })),
    media: product.media.map((media) => toProductMediaDto(media, urlFor)),
    categories: product.categories.map((link) => toTaxonomyRef(link.category)),
    occasions: product.occasions.map((link) => toTaxonomyRef(link.occasion)),
    recipients: product.recipients.map((link) => toTaxonomyRef(link.recipient)),
    styles: product.styles.map((link) => toTaxonomyRef(link.style)),
    colors: product.colors.map((link) => toTaxonomyRef(link.color)),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function toProductPublicDto(
  product: ProductWithRelations,
  urlFor: MediaUrlResolver,
): ProductPublicDto {
  const price: PriceRangeDto =
    activeVariantPrices(product.currency, product.variants) ??
    derivePriceRange(product.currency, [0n])!;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    availability: product.availability,
    featured: product.featured,
    currency: product.currency,
    price,
    seo: toProductSeo(product),
    variants: product.variants
      .filter((variant) => variant.status === 'ACTIVE')
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
        priceMinor: variant.priceMinor.toString(),
        sortOrder: variant.sortOrder,
      })),
    components: product.components.map((component) => ({
      displayName: component.displayName,
      quantity: component.quantity,
      unit: component.unit,
      flowerSlug: component.flower?.slug ?? null,
    })),
    media: product.media.map((media) => {
      const dto = toProductMediaDto(media, urlFor);
      return {
        url: dto.url,
        alt: dto.alt,
        isPrimary: dto.isPrimary,
        sortOrder: dto.sortOrder,
        width: dto.width,
        height: dto.height,
        derivatives: dto.derivatives,
      };
    }),
    categories: product.categories.map((link) => toTaxonomyRef(link.category)),
    occasions: product.occasions.map((link) => toTaxonomyRef(link.occasion)),
    recipients: product.recipients.map((link) => toTaxonomyRef(link.recipient)),
    styles: product.styles.map((link) => toTaxonomyRef(link.style)),
    colors: product.colors.map((link) => toTaxonomyRef(link.color)),
  };
}

export function toProductListItemDto(
  product: ProductWithRelations,
  urlFor: MediaUrlResolver,
): ProductListItemDto {
  const primary = primaryMedia(product);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    lifecycle: product.lifecycle,
    availability: product.availability,
    featured: product.featured,
    price: activeVariantPrices(product.currency, product.variants),
    primaryImageUrl: primary ? urlFor(primary.mediaAsset.storageKey) : null,
    categories: product.categories.map((link) => toTaxonomyRef(link.category)),
    updatedAt: product.updatedAt.toISOString(),
  };
}

/** Flattens a product into the slug/price shape consumed by collection rules. */
export function toRuleCandidate(product: ProductWithRelations): {
  availability: CommercialAvailability;
  lifecycle: string;
  categorySlugs: string[];
  occasionSlugs: string[];
  recipientSlugs: string[];
  styleSlugs: string[];
  flowerSlugs: string[];
  colorSlugs: string[];
  minActivePriceMinor: bigint | null;
} {
  const activePrices = product.variants
    .filter((variant) => variant.status === 'ACTIVE')
    .map((variant) => variant.priceMinor);

  return {
    availability: product.availability,
    lifecycle: product.lifecycle,
    categorySlugs: product.categories.map((link) => link.category.slug),
    occasionSlugs: product.occasions.map((link) => link.occasion.slug),
    recipientSlugs: product.recipients.map((link) => link.recipient.slug),
    styleSlugs: product.styles.map((link) => link.style.slug),
    flowerSlugs: product.components
      .map((component) => component.flower?.slug)
      .filter((slug): slug is string => Boolean(slug)),
    colorSlugs: product.colors.map((link) => link.color.slug),
    minActivePriceMinor:
      activePrices.length > 0
        ? activePrices.reduce((min, price) => (price < min ? price : min), activePrices[0]!)
        : null,
  };
}

export function asCollectionRules(value: unknown): CollectionRulesDto | null {
  return (value as CollectionRulesDto | null) ?? null;
}

export function toCollectionAdminDto(
  collection: CollectionWithProducts,
  matchCount?: number,
): CollectionAdminDto {
  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    type: collection.type,
    rules: asCollectionRules(collection.rules),
    sortOrder: collection.sortOrder,
    visibility: collection.visibility,
    version: collection.version,
    seoTitle: collection.seoTitle,
    seoDescription: collection.seoDescription,
    noIndex: collection.noIndex,
    productIds: collection.products.map((link) => link.productId),
    ...(matchCount === undefined ? {} : { matchCount }),
    createdAt: collection.createdAt.toISOString(),
    updatedAt: collection.updatedAt.toISOString(),
  };
}

export function toCollectionPublicDto(
  collection: CollectionWithProducts,
  products: ProductWithRelations[],
  urlFor: MediaUrlResolver,
): CollectionPublicDto {
  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    seo: toCollectionSeo(collection),
    products: products.map((product) => toProductListItemDto(product, urlFor)),
  };
}

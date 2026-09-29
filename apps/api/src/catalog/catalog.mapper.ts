/**
 * Prisma row → DTO mapping for the catalog.
 * Media URLs arrive through a resolver so mapping stays free of storage details.
 * Promotion pricing is always derived server-side (see promotion.util).
 */
import type { Prisma } from '@bouquet-one/database';
import {
  defaultProductSeoDescription,
  defaultProductSeoTitle,
  derivePriceRange,
  type BestsellerGroupAdminDto,
  type BestsellerGroupPublicDto,
  type BouquetSizeAdminDto,
  type BouquetSizePublicDto,
  type BudgetRangeDto,
  type BudgetRangePublicDto,
  type ColorAdminDto,
  type PriceRangeDto,
  type ProductAdminDto,
  type ProductListItemDto,
  type ProductMediaDto,
  type ProductPromotionAdminDto,
  type ProductPublicDto,
  type SeoFieldsDto,
  type TaxonomyAdminDto,
  type TaxonomyPublicDto,
  type TaxonomyRefDto,
  type TaxonomyVisibility,
} from '@bouquet-one/contracts';
import { activeVariantPrices } from './catalog.logic';
import {
  LIST_IMAGE_TARGET_WIDTH,
  pickDerivativeStorageUrl,
} from '../media/media-url.util';
import {
  buildPublicPromotionDto,
  effectiveVariantPriceMinor,
  isPromotionEffective,
  type PromotionRow,
} from './promotion.util';

export type MediaUrlResolver = (storageKey: string) => string;

export const PRODUCT_INCLUDE = {
  bouquetSize: true,
  variants: { orderBy: { sortOrder: 'asc' } },
  components: { orderBy: { sortOrder: 'asc' }, include: { flower: true } },
  media: {
    orderBy: { sortOrder: 'asc' },
    include: { mediaAsset: { include: { derivatives: { orderBy: { width: 'asc' } } } } },
  },
  occasions: { include: { occasion: true } },
  recipients: { include: { recipient: true } },
  colors: { include: { color: true } },
  productLines: { include: { productLine: true } },
  promotion: { include: { variantPrices: true } },
  bestsellerLinks: { select: { groupId: true, sortOrder: true } },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/** Shared shape of the SEO-bearing taxonomy tables (flowers, occasions, recipients, colors). */
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

/** BouquetSize / ProductLine have no SEO columns — filter facets, not landing pages. */
export type BouquetSizeRecord = Omit<
  TaxonomyRecord,
  'seoTitle' | 'seoDescription' | 'noIndex'
>;

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

export function toColorAdminDto(row: TaxonomyRecord & { swatch: string | null }): ColorAdminDto {
  return { ...toTaxonomyAdminDto(row), swatch: row.swatch };
}

export function toBouquetSizeAdminDto(row: BouquetSizeRecord): BouquetSizeAdminDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    visibility: row.visibility,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toBouquetSizePublicDto(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}): BouquetSizePublicDto {
  return { id: row.id, slug: row.slug, name: row.name, description: row.description };
}

export function toBudgetRangeAdminDto(row: {
  id: string;
  label: string;
  minMinor: bigint | null;
  maxMinor: bigint | null;
  sortOrder: number;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): BudgetRangeDto {
  return {
    id: row.id,
    label: row.label,
    minMinor: row.minMinor?.toString() ?? null,
    maxMinor: row.maxMinor?.toString() ?? null,
    sortOrder: row.sortOrder,
    active: row.active,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toBudgetRangePublicDto(row: {
  id: string;
  label: string;
  minMinor: bigint | null;
  maxMinor: bigint | null;
}): BudgetRangePublicDto {
  return {
    id: row.id,
    label: row.label,
    minMinor: row.minMinor?.toString() ?? null,
    maxMinor: row.maxMinor?.toString() ?? null,
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
      resolvedTitle: row.seoTitle ?? `${row.name} | BUKET №1`,
      resolvedDescription:
        row.seoDescription ??
        row.description ??
        `${row.name} — доставка цветов по Гродно | BUKET №1`,
    },
  };
}

/** Promotion row in the shape the pricing helpers expect. */
export function toPromotionRow(product: ProductWithRelations): PromotionRow | null {
  if (!product.promotion) return null;
  return {
    enabled: product.promotion.enabled,
    type: product.promotion.type,
    percentOff: product.promotion.percentOff,
    startsAt: product.promotion.startsAt,
    endsAt: product.promotion.endsAt,
    variantPrices: product.promotion.variantPrices.map((row) => ({
      variantId: row.variantId,
      salePriceMinor: row.salePriceMinor,
    })),
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

/** Flowers are a derived facet: the composition is the single source of truth. */
export function derivedFlowers(product: ProductWithRelations): TaxonomyRefDto[] {
  const seen = new Set<string>();
  const flowers: TaxonomyRefDto[] = [];
  for (const component of product.components) {
    if (!component.flower || seen.has(component.flower.id)) continue;
    seen.add(component.flower.id);
    flowers.push(toTaxonomyRef(component.flower));
  }
  return flowers;
}

function defaultVariantForList(
  product: ProductWithRelations,
  now: Date,
): ProductListItemDto['defaultVariant'] {
  const promo = toPromotionRow(product);
  const active = product.variants
    .filter((variant) => variant.status === 'ACTIVE')
    .slice()
    .sort((a, b) => {
      const byOrder = a.sortOrder - b.sortOrder;
      if (byOrder !== 0) return byOrder;
      if (a.priceMinor === b.priceMinor) return 0;
      return a.priceMinor < b.priceMinor ? -1 : 1;
    });
  const pick = active[0];
  if (!pick) return null;
  return {
    id: pick.id,
    name: pick.name,
    priceMinor: effectiveVariantPriceMinor(pick, promo, now).toString(),
  };
}

function toVariantDtos(product: ProductWithRelations, now: Date) {
  const promo = toPromotionRow(product);
  return product.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    priceMinor: variant.priceMinor.toString(),
    effectivePriceMinor: effectiveVariantPriceMinor(variant, promo, now).toString(),
    sortOrder: variant.sortOrder,
    status: variant.status,
  }));
}

export function toPromotionAdminDto(
  product: ProductWithRelations,
  now: Date,
): ProductPromotionAdminDto | null {
  if (!product.promotion) return null;
  const promo = toPromotionRow(product);
  return {
    enabled: product.promotion.enabled,
    type: product.promotion.type,
    percentOff: product.promotion.percentOff,
    startsAt: product.promotion.startsAt?.toISOString() ?? null,
    endsAt: product.promotion.endsAt?.toISOString() ?? null,
    variantSalePrices: product.promotion.variantPrices.map((row) => ({
      variantId: row.variantId,
      salePriceMinor: row.salePriceMinor.toString(),
    })),
    version: product.promotion.version,
    currentlyEffective: isPromotionEffective(promo, now),
  };
}

export function toProductAdminDto(
  product: ProductWithRelations,
  urlFor: MediaUrlResolver,
  now = new Date(),
): ProductAdminDto {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    lifecycle: product.lifecycle,
    availability: product.availability,
    heightCm: product.heightCm ?? null,
    bouquetSize: product.bouquetSize ? toTaxonomyRef(product.bouquetSize) : null,
    bouquetSizeId: product.bouquetSizeId,
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
    promotion: toPromotionAdminDto(product, now),
    variants: toVariantDtos(product, now),
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
    occasions: product.occasions.map((link) => toTaxonomyRef(link.occasion)),
    recipients: product.recipients.map((link) => toTaxonomyRef(link.recipient)),
    colors: product.colors.map((link) => toTaxonomyRef(link.color)),
    productLines: product.productLines.map((link) => toTaxonomyRef(link.productLine)),
    flowers: derivedFlowers(product),
    bestsellerGroupIds: product.bestsellerLinks.map((link) => link.groupId),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function toProductPublicDto(
  product: ProductWithRelations,
  urlFor: MediaUrlResolver,
  now = new Date(),
): ProductPublicDto {
  const price: PriceRangeDto =
    activeVariantPrices(product.currency, product.variants) ??
    derivePriceRange(product.currency, [0n])!;
  const promo = toPromotionRow(product);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    availability: product.availability,
    heightCm: product.heightCm ?? null,
    bouquetSize: product.bouquetSize ? toTaxonomyRef(product.bouquetSize) : null,
    currency: product.currency,
    price,
    promotion: buildPublicPromotionDto(product.currency, product.variants, promo, now),
    seo: toProductSeo(product),
    variants: product.variants
      .filter((variant) => variant.status === 'ACTIVE')
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
        priceMinor: variant.priceMinor.toString(),
        effectivePriceMinor: effectiveVariantPriceMinor(variant, promo, now).toString(),
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
    occasions: product.occasions.map((link) => toTaxonomyRef(link.occasion)),
    recipients: product.recipients.map((link) => toTaxonomyRef(link.recipient)),
    colors: product.colors.map((link) => toTaxonomyRef(link.color)),
    productLines: product.productLines.map((link) => toTaxonomyRef(link.productLine)),
    flowers: derivedFlowers(product),
  };
}

export function toProductListItemDto(
  product: ProductWithRelations,
  urlFor: MediaUrlResolver,
  now = new Date(),
): ProductListItemDto {
  const primary = primaryMedia(product);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    lifecycle: product.lifecycle,
    availability: product.availability,
    heightCm: product.heightCm ?? null,
    bouquetSize: product.bouquetSize ? toTaxonomyRef(product.bouquetSize) : null,
    price: activeVariantPrices(product.currency, product.variants),
    promotion: buildPublicPromotionDto(
      product.currency,
      product.variants,
      toPromotionRow(product),
      now,
    ),
    defaultVariant: defaultVariantForList(product, now),
    primaryImageUrl: primary
      ? pickDerivativeStorageUrl(
          primary.mediaAsset.storageKey,
          primary.mediaAsset.derivatives.map((d) => ({
            width: d.width,
            format: d.format,
            storageKey: d.storageKey,
          })),
          urlFor,
          LIST_IMAGE_TARGET_WIDTH,
        )
      : null,
    flowers: derivedFlowers(product),
    colors: product.colors.map((link) => toTaxonomyRef(link.color)),
    productLines: product.productLines.map((link) => toTaxonomyRef(link.productLine)),
    updatedAt: product.updatedAt.toISOString(),
    bestsellerGroupIds: product.bestsellerLinks.map((link) => link.groupId),
  };
}

export type BestsellerGroupWithProducts = {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  sortOrder: number;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  products: Array<{ productId: string; sortOrder: number }>;
};

export function toBestsellerGroupAdminDto(
  group: BestsellerGroupWithProducts,
  productsById: Map<string, ProductListItemDto>,
): BestsellerGroupAdminDto {
  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    title: group.title,
    sortOrder: group.sortOrder,
    active: group.active,
    version: group.version,
    products: [...group.products]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((link) => ({
        productId: link.productId,
        sortOrder: link.sortOrder,
        product: productsById.get(link.productId) ?? null,
      })),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

export function toBestsellerGroupPublicDto(
  group: BestsellerGroupWithProducts,
  productsById: Map<string, ProductListItemDto>,
): BestsellerGroupPublicDto {
  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    title: group.title,
    products: [...group.products]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((link) => productsById.get(link.productId))
      .filter((product): product is ProductListItemDto => Boolean(product)),
  };
}

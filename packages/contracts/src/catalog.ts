/**
 * Catalog domain contracts — shared by API, admin web, and future storefront.
 * No Prisma types.
 */

export const PRODUCT_LIFECYCLES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ProductLifecycle = (typeof PRODUCT_LIFECYCLES)[number];

export const COMMERCIAL_AVAILABILITIES = [
  'AVAILABLE',
  'TEMPORARILY_UNAVAILABLE',
  'PREORDER',
  'SEASONAL',
] as const;
export type CommercialAvailability = (typeof COMMERCIAL_AVAILABILITIES)[number];

export const VARIANT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

export const TAXONOMY_VISIBILITIES = ['VISIBLE', 'HIDDEN'] as const;
export type TaxonomyVisibility = (typeof TAXONOMY_VISIBILITIES)[number];

export const COLLECTION_TYPES = ['MANUAL', 'RULE_BASED'] as const;
export type CollectionType = (typeof COLLECTION_TYPES)[number];

export const COMPONENT_UNITS = ['PIECE', 'STEM', 'BUNCH', 'UNSPECIFIED'] as const;
export type ComponentUnit = (typeof COMPONENT_UNITS)[number];

export const SLUG_ENTITY_TYPES = [
  'PRODUCT',
  'CATEGORY',
  'OCCASION',
  'RECIPIENT',
  'STYLE',
  'COLOR',
  'FLOWER',
  'COLLECTION',
] as const;
export type SlugEntityType = (typeof SLUG_ENTITY_TYPES)[number];

export type MoneyMinorDto = {
  currency: string;
  /** Integer minor units as string for JSON safety */
  amountMinor: string;
};

export type PriceRangeDto = {
  currency: string;
  minMinor: string;
  maxMinor: string;
  single: boolean;
  /** Human label e.g. "99,00 BYN" or "от 99,00 BYN" */
  label: string;
};

export type SeoFieldsDto = {
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
  /** Resolved title for preview (custom or generated) */
  resolvedTitle: string;
  resolvedDescription: string;
};

export type TaxonomyRefDto = {
  id: string;
  slug: string;
  name: string;
};

export type TaxonomyAdminDto = {
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
  createdAt: string;
  updatedAt: string;
};

export type ProductVariantDto = {
  id: string;
  name: string;
  priceMinor: string;
  sortOrder: number;
  status: VariantStatus;
};

export type ProductComponentDto = {
  id: string;
  flowerId: string | null;
  flower: TaxonomyRefDto | null;
  displayName: string;
  quantity: number | null;
  unit: ComponentUnit;
  sortOrder: number;
};

export type ProductMediaDto = {
  id: string;
  mediaAssetId: string;
  sortOrder: number;
  isPrimary: boolean;
  alt: string | null;
  caption: string | null;
  url: string;
  width: number | null;
  height: number | null;
  mimeType: string;
  derivatives: Array<{
    width: number;
    format: string;
    url: string;
  }>;
};

export type ProductListItemDto = {
  id: string;
  slug: string;
  name: string;
  lifecycle: ProductLifecycle;
  availability: CommercialAvailability;
  featured: boolean;
  /** Approximate height in cm when set in admin; null = not shown. */
  heightCm: number | null;
  price: PriceRangeDto | null;
  /** Cheapest active variant for quick-add from catalog cards. */
  defaultVariant: { id: string; name: string; priceMinor: string } | null;
  primaryImageUrl: string | null;
  categories: TaxonomyRefDto[];
  updatedAt: string;
};

export type ProductAdminDto = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  lifecycle: ProductLifecycle;
  availability: CommercialAvailability;
  featured: boolean;
  heightCm: number | null;
  currency: string;
  publishedAt: string | null;
  publishAt: string | null;
  unpublishAt: string | null;
  version: number;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
  seo: SeoFieldsDto;
  price: PriceRangeDto | null;
  variants: ProductVariantDto[];
  components: ProductComponentDto[];
  media: ProductMediaDto[];
  categories: TaxonomyRefDto[];
  occasions: TaxonomyRefDto[];
  recipients: TaxonomyRefDto[];
  styles: TaxonomyRefDto[];
  colors: TaxonomyRefDto[];
  createdAt: string;
  updatedAt: string;
};

/** Storefront-safe product DTO (no admin version/audit fields). */
export type ProductPublicDto = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  availability: CommercialAvailability;
  featured: boolean;
  heightCm: number | null;
  currency: string;
  price: PriceRangeDto;
  seo: SeoFieldsDto;
  variants: Array<{
    id: string;
    name: string;
    priceMinor: string;
    sortOrder: number;
  }>;
  components: Array<{
    displayName: string;
    quantity: number | null;
    unit: ComponentUnit;
    flowerSlug: string | null;
  }>;
  media: Array<{
    url: string;
    alt: string | null;
    isPrimary: boolean;
    sortOrder: number;
    width: number | null;
    height: number | null;
    derivatives: Array<{ width: number; format: string; url: string }>;
  }>;
  categories: TaxonomyRefDto[];
  occasions: TaxonomyRefDto[];
  recipients: TaxonomyRefDto[];
  styles: TaxonomyRefDto[];
  colors: TaxonomyRefDto[];
};

export type CollectionRulesDto = {
  categorySlugs?: string[];
  occasionSlugs?: string[];
  recipientSlugs?: string[];
  styleSlugs?: string[];
  flowerSlugs?: string[];
  colorSlugs?: string[];
  minPriceMinor?: string;
  maxPriceMinor?: string;
  availabilities?: CommercialAvailability[];
  /** Only PUBLISHED considered for public matching */
  requirePublished?: boolean;
};

export type CollectionAdminDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: CollectionType;
  rules: CollectionRulesDto | null;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  version: number;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
  productIds: string[];
  matchCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CollectionPublicDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  seo: SeoFieldsDto;
  products: ProductListItemDto[];
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type PublishValidationIssue = {
  code: string;
  message: string;
  field?: string;
};

export type PublishValidationErrorBody = {
  statusCode: 400;
  error: 'PublishValidationError';
  message: string;
  issues: PublishValidationIssue[];
  requestId?: string;
  path: string;
  timestamp: string;
};

export function isProductLifecycle(value: string): value is ProductLifecycle {
  return (PRODUCT_LIFECYCLES as readonly string[]).includes(value);
}

export function isCommercialAvailability(value: string): value is CommercialAvailability {
  return (COMMERCIAL_AVAILABILITIES as readonly string[]).includes(value);
}

export function formatPriceFromMinor(
  amountMinor: string | bigint,
  currency = 'BYN',
  fractionDigits = 2,
): string {
  const value = typeof amountMinor === 'bigint' ? amountMinor : BigInt(amountMinor);
  const scale = 10n ** BigInt(fractionDigits);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / scale;
  const fraction = abs % scale;
  const sign = negative ? '-' : '';
  return `${sign}${whole.toString()},${fraction.toString().padStart(fractionDigits, '0')} ${currency}`;
}

export function formatPriceRangeLabel(
  currency: string,
  minMinor: bigint,
  maxMinor: bigint,
  fractionDigits = 2,
): { single: boolean; label: string; minMinor: string; maxMinor: string } {
  const fmt = (n: bigint) => formatPriceFromMinor(n, currency, fractionDigits);
  const single = minMinor === maxMinor;
  return {
    single,
    label: single ? fmt(minMinor) : `от ${fmt(minMinor)}`,
    minMinor: minMinor.toString(),
    maxMinor: maxMinor.toString(),
  };
}

export function derivePriceRange(
  currency: string,
  activePricesMinor: readonly bigint[],
): PriceRangeDto | null {
  if (activePricesMinor.length === 0) return null;
  let min = activePricesMinor[0]!;
  let max = activePricesMinor[0]!;
  for (const p of activePricesMinor) {
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const formatted = formatPriceRangeLabel(currency, min, max);
  return {
    currency,
    minMinor: formatted.minMinor,
    maxMinor: formatted.maxMinor,
    single: formatted.single,
    label: formatted.label,
  };
}

export function defaultProductSeoTitle(name: string): string {
  return `Букет «${name}» с доставкой по Гродно | БУКЕТ №1`;
}

export function defaultProductSeoDescription(name: string, shortDescription?: string | null): string {
  if (shortDescription && shortDescription.trim().length > 0) {
    return shortDescription.trim().slice(0, 500);
  }
  return `Закажите букет «${name}» в БУКЕТ №1 — доставка цветов по Гродно.`;
}

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 160);
}

/**
 * Catalog domain contracts — shared by API, admin web, and storefront.
 * No Prisma types.
 *
 * Navigation: CatalogCategory tree (Цветы → Розы, …).
 * Flower dictionary: FlowerType → FlowerVariety → FlowerItem (type+variety+origin+height).
 * Composition: ProductComponent → FlowerItem (+ quantity/unit). Legacy Flower facet optional.
 * Product.flowerType/Variety/Origin/heightCm: legacy denormalized attrs (deprecated for discovery).
 * Cross-product UX: ProductFamily (not sellable).
 * In-card commerce: ProductVariant (unchanged; composition stays product-level).
 * Discovery facets: Budget, Occasion/Recipient, Color, Flower (legacy), BouquetSize, ProductLine.
 * Merchandising: Promotions, Bestsellers.
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

export const COMPONENT_UNITS = ['PIECE', 'STEM', 'BUNCH', 'UNSPECIFIED'] as const;
export type ComponentUnit = (typeof COMPONENT_UNITS)[number];

export const SLUG_ENTITY_TYPES = [
  'PRODUCT',
  'OCCASION',
  'RECIPIENT',
  'COLOR',
  'FLOWER',
  'BOUQUET_SIZE',
] as const;
export type SlugEntityType = (typeof SLUG_ENTITY_TYPES)[number];

export const PROMOTION_TYPES = ['PERCENT', 'FIXED'] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

/** Catalog sorts — "recommended" = Admin merchandising / newest fallback (not fake popularity). */
export const PRODUCT_SORTS = ['recommended', 'price_asc', 'price_desc', 'newest'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** Optional CatalogCategory.listingKind — drives filter UI, not a hard schema enum. */
export const CATALOG_LISTING_KINDS = [
  'FLOWERS',
  'BOUQUETS',
  'COMPOSITIONS',
  'GIFTS',
  'OTHER',
] as const;
export type CatalogListingKind = (typeof CATALOG_LISTING_KINDS)[number];

/** Storefront height filter bands mapped to Product.heightCm. */
export const HEIGHT_BANDS = [
  { id: 'up_to_50', label: 'до 50 см', minCm: null, maxCm: 50 },
  { id: '50_60', label: '50–60 см', minCm: 50, maxCm: 60 },
  { id: '60_70', label: '60–70 см', minCm: 60, maxCm: 70 },
  { id: '70_plus', label: '70+ см', minCm: 70, maxCm: null },
] as const;
export type HeightBandId = (typeof HEIGHT_BANDS)[number]['id'];

export function isCatalogListingKind(value: string): value is CatalogListingKind {
  return (CATALOG_LISTING_KINDS as readonly string[]).includes(value);
}

export function isHeightBandId(value: string): value is HeightBandId {
  return HEIGHT_BANDS.some((band) => band.id === value);
}

export function heightBandWhere(
  bandId: HeightBandId,
): { gte?: number; lte?: number } | null {
  const band = HEIGHT_BANDS.find((item) => item.id === bandId);
  if (!band) return null;
  if (band.minCm != null && band.maxCm != null) {
    return { gte: band.minCm, lte: band.maxCm };
  }
  if (band.maxCm != null) return { lte: band.maxCm };
  if (band.minCm != null) return { gte: band.minCm };
  return null;
}

export type CatalogCategoryDto = {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  listingKind: CatalogListingKind | null;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
};

export type CatalogCategoryTreeNodeDto = CatalogCategoryDto & {
  children: CatalogCategoryTreeNodeDto[];
};

export type CatalogCategoryAdminDto = CatalogCategoryDto & {
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Direct children. */
  childrenCount: number;
  /** Products assigned directly to this category. */
  productsCount: number;
  /** Products on this category + all descendants (admin tree). */
  descendantProductsCount: number;
};

export type FlowerTypeDto = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  visibility: TaxonomyVisibility;
};

/** Admin list for flower types — includes usage for safe delete UX. */
export type FlowerTypeAdminDto = FlowerTypeDto & {
  version: number;
  productsCount: number;
  varietiesCount: number;
  /** Concrete FlowerItem rows under this type. */
  itemsCount?: number;
};

export type FlowerVarietyDto = {
  id: string;
  flowerTypeId: string;
  slug: string;
  name: string;
  sortOrder: number;
  visibility: TaxonomyVisibility;
};

export type FlowerVarietyAdminDto = FlowerVarietyDto & {
  version: number;
  productsCount: number;
  itemsCount?: number;
};

export type FlowerOriginDto = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  visibility: TaxonomyVisibility;
};

export type FlowerOriginAdminDto = FlowerOriginDto & {
  version: number;
  productsCount: number;
  itemsCount?: number;
};

/**
 * Concrete reusable stem/SKU: Type + optional Variety + Origin + height.
 * Quantity is NEVER on FlowerItem — only on ProductComponent.
 */
export type FlowerItemDto = {
  id: string;
  flowerTypeId: string;
  flowerVarietyId: string | null;
  flowerOriginId: string | null;
  heightCm: number | null;
  slug: string;
  name: string;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  flowerType: TaxonomyRefDto;
  flowerVariety: TaxonomyRefDto | null;
  flowerOrigin: TaxonomyRefDto | null;
};

export type FlowerItemAdminDto = FlowerItemDto & {
  version: number;
  /** Products that reference this item via ProductComponent. */
  componentsCount: number;
  identityKey: string;
};

/** Why a destructive catalog-structure delete is blocked. */
export type CatalogDeleteBlockerDto = {
  code: 'HAS_CHILDREN' | 'HAS_PRODUCTS' | 'HAS_VARIETIES' | 'HAS_COMPONENTS' | 'HAS_ITEMS' | 'NOT_EMPTY';
  message: string;
  productsCount?: number;
  childrenCount?: number;
  varietiesCount?: number;
  componentsCount?: number;
  itemsCount?: number;
};

/** Stable uniqueness key for FlowerItem (null parts → `_`). */
export function flowerItemIdentityKey(input: {
  flowerTypeId: string;
  flowerVarietyId?: string | null;
  flowerOriginId?: string | null;
  heightCm?: number | null;
}): string {
  return [
    input.flowerTypeId,
    input.flowerVarietyId ?? '_',
    input.flowerOriginId ?? '_',
    input.heightCm == null ? '_' : String(input.heightCm),
  ].join('|');
}

/** Human label for a flower item (manager-facing). */
export function flowerItemDisplayName(input: {
  typeName: string;
  varietyName?: string | null;
  originName?: string | null;
  heightCm?: number | null;
}): string {
  const parts: string[] = [input.typeName.trim()];
  if (input.varietyName?.trim()) parts.push(input.varietyName.trim());
  const detail: string[] = [];
  if (input.originName?.trim()) detail.push(input.originName.trim());
  if (input.heightCm != null) detail.push(`${input.heightCm} см`);
  if (detail.length === 0) return parts.join(' ');
  return `${parts.join(' ')} · ${detail.join(' · ')}`;
}

/** Suggest a product name from composition rows (manager confirms). */
export function suggestProductNameFromComposition(
  rows: Array<{ displayName: string; quantity: number | null }>,
): string {
  const usable = rows.filter((row) => row.displayName.trim().length > 0);
  if (usable.length === 0) return '';
  if (usable.length === 1) {
    const row = usable[0]!;
    const qty = row.quantity && row.quantity > 0 ? row.quantity : null;
    const label = row.displayName.trim();
    if (qty) return `Букет из ${qty} ${label}`;
    return `Букет: ${label}`;
  }
  return `Авторский букет (${usable.length} позиции)`;
}

export type ProductFamilyMemberDto = {
  productId: string;
  slug: string;
  name: string;
  sortOrder: number;
  heightCm: number | null;
  flowerOrigin: TaxonomyRefDto | null;
  price: PriceRangeDto | null;
  primaryImageUrl: string | null;
  availability: CommercialAvailability;
  lifecycle?: ProductLifecycle;
  /** Present on storefront when the member is the currently viewed product. */
  isCurrent?: boolean;
};

export type ProductFamilyDto = {
  id: string;
  name: string;
  version: number;
  members: ProductFamilyMemberDto[];
};

/**
 * Clean storefront card subtitle — avoids duplicating name when it already
 * contains height/origin words.
 */
export function productCardSubtitle(input: {
  name: string;
  heightCm: number | null;
  originName: string | null;
  varietyName?: string | null;
}): string | null {
  const parts: string[] = [];
  const nameLower = input.name.toLowerCase();
  if (input.heightCm != null) {
    const heightLabel = `${input.heightCm} см`;
    if (!nameLower.includes(`${input.heightCm}`) && !nameLower.includes(heightLabel)) {
      parts.push(heightLabel);
    }
  }
  if (input.originName) {
    if (!nameLower.includes(input.originName.toLowerCase())) {
      parts.push(input.originName);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

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

export type ColorAdminDto = TaxonomyAdminDto & {
  swatch: string | null;
};

export type BouquetSizeAdminDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type BouquetSizePublicDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type BudgetRangeDto = {
  id: string;
  label: string;
  minMinor: string | null;
  maxMinor: string | null;
  sortOrder: number;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type BudgetRangePublicDto = {
  id: string;
  label: string;
  minMinor: string | null;
  maxMinor: string | null;
};

export type ProductVariantDto = {
  id: string;
  name: string;
  priceMinor: string;
  /** Effective price after active promotion (equals priceMinor when none). */
  effectivePriceMinor: string;
  sortOrder: number;
  status: VariantStatus;
};

export type ProductComponentDto = {
  id: string;
  flowerItemId: string | null;
  flowerItem: FlowerItemDto | null;
  /** @deprecated Prefer flowerItemId. Kept for /cvety legacy facet. */
  flowerId: string | null;
  flower: TaxonomyRefDto | null;
  displayName: string;
  quantity: number | null;
  unit: ComponentUnit;
  sortOrder: number;
};

/** Admin helper: whether composition is on FlowerItem or still on legacy flower attrs. */
export type CompositionSetupStatus = 'ready' | 'legacy_pending' | 'empty';

export function resolveCompositionSetupStatus(input: {
  flowerTypeId?: string | null;
  flowerVarietyId?: string | null;
  flowerOriginId?: string | null;
  components: Array<{ flowerItemId?: string | null; flowerId?: string | null }>;
}): CompositionSetupStatus {
  if (input.components.some((row) => Boolean(row.flowerItemId))) return 'ready';
  const hasLegacyProduct =
    Boolean(input.flowerTypeId) ||
    Boolean(input.flowerVarietyId) ||
    Boolean(input.flowerOriginId);
  const hasLegacyComponent = input.components.some((row) => Boolean(row.flowerId));
  if (hasLegacyProduct || hasLegacyComponent) return 'legacy_pending';
  return 'empty';
}

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

/** Server-authoritative promotion display for a product (null when not effective). */
export type ProductPromotionPublicDto = {
  type: PromotionType;
  /** Display percent off (1–99), derived for FIXED when meaningful. */
  percentOff: number | null;
  /** Original (regular) price range before promotion. */
  originalPrice: PriceRangeDto;
  /** Effective promotional price range. */
  salePrice: PriceRangeDto;
};

export type ProductPromotionAdminDto = {
  enabled: boolean;
  type: PromotionType;
  percentOff: number | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Required when type = FIXED: sale price per variant id. */
  variantSalePrices: Array<{ variantId: string; salePriceMinor: string }>;
  version: number;
  /** Whether currently effective (Europe/Minsk clock at read time). */
  currentlyEffective: boolean;
};

/** Filter/status values for admin «Акции» list (excludes query sentinel `all`). */
export const ADMIN_PROMOTION_LIST_STATUSES = [
  'active',
  'scheduled',
  'ended',
  'disabled',
] as const;
export type AdminPromotionListStatus = (typeof ADMIN_PROMOTION_LIST_STATUSES)[number];

/**
 * Admin «Акции» overview row.
 * - `promotion` — public display prices when currently effective (else null)
 * - `promotionAdmin` — full schedule/config for the row
 * - `status` — derived chip state for the list
 */
export type AdminPromotionListItemDto = ProductListItemDto & {
  promotionAdmin: ProductPromotionAdminDto;
  status: AdminPromotionListStatus;
};

export type ProductListItemDto = {
  id: string;
  slug: string;
  name: string;
  lifecycle: ProductLifecycle;
  availability: CommercialAvailability;
  /** OCC token — required for admin quick updates from the list. */
  version: number;
  /** Optional stem/product height in cm (flower filters when set). */
  heightCm: number | null;
  bouquetSize: TaxonomyRefDto | null;
  catalogCategory: TaxonomyRefDto | null;
  flowerType: TaxonomyRefDto | null;
  flowerVariety: TaxonomyRefDto | null;
  flowerOrigin: TaxonomyRefDto | null;
  family: { id: string; name: string } | null;
  /** Presentation helper for storefront cards. */
  cardSubtitle: string | null;
  price: PriceRangeDto | null;
  promotion: ProductPromotionPublicDto | null;
  /** Cheapest active variant for quick-add (effective promotional price). */
  defaultVariant: { id: string; name: string; priceMinor: string } | null;
  primaryImageUrl: string | null;
  flowers: TaxonomyRefDto[];
  colors: TaxonomyRefDto[];
  productLines: TaxonomyRefDto[];
  updatedAt: string;
  /** Admin list helpers */
  bestsellerGroupIds?: string[];
};

export type ProductAdminDto = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  lifecycle: ProductLifecycle;
  availability: CommercialAvailability;
  heightCm: number | null;
  bouquetSize: TaxonomyRefDto | null;
  bouquetSizeId: string | null;
  catalogCategoryId: string | null;
  catalogCategory: TaxonomyRefDto | null;
  flowerTypeId: string | null;
  flowerType: TaxonomyRefDto | null;
  flowerVarietyId: string | null;
  flowerVariety: TaxonomyRefDto | null;
  flowerOriginId: string | null;
  flowerOrigin: TaxonomyRefDto | null;
  family: ProductFamilyDto | null;
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
  promotion: ProductPromotionAdminDto | null;
  variants: ProductVariantDto[];
  components: ProductComponentDto[];
  media: ProductMediaDto[];
  occasions: TaxonomyRefDto[];
  recipients: TaxonomyRefDto[];
  colors: TaxonomyRefDto[];
  productLines: TaxonomyRefDto[];
  /** Derived from composition (ProductComponent.flowerId). */
  flowers: TaxonomyRefDto[];
  /** ready = has FlowerItem composition; legacy_pending = old flower attrs without FlowerItem. */
  compositionSetupStatus: CompositionSetupStatus;
  bestsellerGroupIds: string[];
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
  heightCm: number | null;
  bouquetSize: TaxonomyRefDto | null;
  catalogCategory: TaxonomyRefDto | null;
  flowerType: TaxonomyRefDto | null;
  flowerVariety: TaxonomyRefDto | null;
  flowerOrigin: TaxonomyRefDto | null;
  /** Other sellable products in the same family (human UX: «Другие варианты»). */
  family: ProductFamilyDto | null;
  cardSubtitle: string | null;
  currency: string;
  price: PriceRangeDto;
  promotion: ProductPromotionPublicDto | null;
  seo: SeoFieldsDto;
  variants: Array<{
    id: string;
    name: string;
    priceMinor: string;
    effectivePriceMinor: string;
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
  occasions: TaxonomyRefDto[];
  recipients: TaxonomyRefDto[];
  colors: TaxonomyRefDto[];
  productLines: TaxonomyRefDto[];
  flowers: TaxonomyRefDto[];
};

export type BestsellerGroupAdminDto = {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  sortOrder: number;
  active: boolean;
  version: number;
  products: Array<{
    productId: string;
    sortOrder: number;
    product: ProductListItemDto | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type BestsellerGroupPublicDto = {
  id: string;
  slug: string;
  name: string;
  title: string | null;
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

export type PromotionValidationIssue = {
  code: string;
  message: string;
  field?: string;
};

export type PromotionValidationErrorBody = {
  statusCode: 400;
  error: 'PromotionValidationError';
  message: string;
  issues: PromotionValidationIssue[];
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

/** Admin bulk product operations (V1). */
export const BULK_PRODUCT_OPERATIONS = ['PUBLISH', 'UNPUBLISH', 'SET_AVAILABILITY'] as const;
export type BulkProductOperation = (typeof BULK_PRODUCT_OPERATIONS)[number];

export const BULK_ITEM_STATUSES = [
  'SUCCESS',
  'NOT_FOUND',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'CONFLICT',
  'FAILED',
] as const;
export type BulkItemStatus = (typeof BULK_ITEM_STATUSES)[number];

/** Server + client hard cap — matches page-scale work, below bestsellers 100. */
export const BULK_PRODUCTS_MAX_ITEMS = 50;

export type BulkProductItemInputDto = {
  productId: string;
  expectedVersion: number;
};

export type BulkProductItemResultDto = {
  productId: string;
  status: BulkItemStatus;
  message?: string;
  version?: number;
  availability?: CommercialAvailability;
  lifecycle?: ProductLifecycle;
};

export type BulkProductOperationResultDto = {
  operation: BulkProductOperation;
  total: number;
  succeeded: number;
  failed: number;
  results: BulkProductItemResultDto[];
};

export function isBulkProductOperation(value: string): value is BulkProductOperation {
  return (BULK_PRODUCT_OPERATIONS as readonly string[]).includes(value);
}

export function isBulkItemStatus(value: string): value is BulkItemStatus {
  return (BULK_ITEM_STATUSES as readonly string[]).includes(value);
}

export function isProductSort(value: string): value is ProductSort {
  return (PRODUCT_SORTS as readonly string[]).includes(value);
}

export function isPromotionType(value: string): value is PromotionType {
  return (PROMOTION_TYPES as readonly string[]).includes(value);
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

/**
 * Apply percentage discount to a minor-unit price.
 * Rounds half-up to nearest minor unit; never returns <= 0 when input > 0.
 */
export function applyPercentOff(priceMinor: bigint, percentOff: number): bigint {
  if (percentOff < 1 || percentOff > 99) {
    throw new Error('percentOff must be 1–99');
  }
  if (priceMinor <= 0n) {
    throw new Error('price must be positive');
  }
  const discounted = (priceMinor * BigInt(100 - percentOff) + 50n) / 100n;
  return discounted < 1n ? 1n : discounted;
}

/** Derive display percent from regular vs sale (null if not meaningful). */
export function deriveDisplayPercentOff(regularMinor: bigint, saleMinor: bigint): number | null {
  if (regularMinor <= 0n || saleMinor <= 0n || saleMinor >= regularMinor) return null;
  const pct = Number(((regularMinor - saleMinor) * 100n) / regularMinor);
  if (pct < 1 || pct > 99) return null;
  return pct;
}

/**
 * Budget range match: product price (any active variant effective price) intersects range.
 * Range bounds are inclusive. Null min/max = open bound.
 */
export function budgetRangeMatchesPrice(
  priceMinor: bigint,
  minMinor: bigint | null,
  maxMinor: bigint | null,
): boolean {
  if (minMinor !== null && priceMinor < minMinor) return false;
  if (maxMinor !== null && priceMinor > maxMinor) return false;
  return true;
}

export function defaultProductSeoTitle(name: string): string {
  return `Букет «${name}» с доставкой по Гродно | BUKET №1`;
}

export function defaultProductSeoDescription(name: string, shortDescription?: string | null): string {
  if (shortDescription && shortDescription.trim().length > 0) {
    return shortDescription.trim().slice(0, 500);
  }
  return `Закажите букет «${name}» в BUKET №1 — доставка цветов по Гродно.`;
}

/** Russian → Latin for URL-safe slugs (GOST-ish, URL-friendly). */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function transliterateCyrillic(input: string): string {
  let out = '';
  for (const char of input) {
    const mapped = CYRILLIC_TO_LATIN[char];
    out += mapped !== undefined ? mapped : char;
  }
  return out;
}

/**
 * URL-safe Latin slug: lowercase a-z, digits, hyphens.
 * Cyrillic is transliterated; other non-Latin characters are dropped.
 */
export function normalizeSlug(input: string): string {
  return transliterateCyrillic(input.trim().toLowerCase())
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 160);
}

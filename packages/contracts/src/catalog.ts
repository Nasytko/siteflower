/**
 * Catalog domain contracts — shared by API, admin web, and storefront.
 * No Prisma types.
 *
 * Navigation: CatalogCategory tree (Цветы → Розы, …).
 * Flower dictionary: FlowerType → FlowerVariety → FlowerItem (type+variety+origin+height).
 * Composition: ProductComponent → FlowerItem (+ quantity/unit).
 * Cross-product UX: ProductFamily (not sellable).
 * In-card commerce: ProductVariant (unchanged; composition stays product-level).
 * Discovery facets: Budget, Occasion/Recipient, Color, stem_height, etc.
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

export const COMPONENT_ROLES = ['PRIMARY', 'GREENERY', 'FILLER', 'OTHER'] as const;
export type ComponentRole = (typeof COMPONENT_ROLES)[number];

export const COMPOSITION_KINDS = ['MONO', 'MIXED', 'UNKNOWN'] as const;
export type CompositionKind = (typeof COMPOSITION_KINDS)[number];

export const COMPOSITION_PRECISIONS = ['EXACT', 'APPROXIMATE', 'UNKNOWN'] as const;
export type CompositionPrecision = (typeof COMPOSITION_PRECISIONS)[number];

/** What is sold — drives admin editor (composition required or not). */
export const PRODUCT_KINDS = [
  'BOUQUET',
  'COMPOSITION',
  'STEM',
  'PLANT',
  'GIFT',
  'OTHER',
] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export function isProductKind(value: string): value is ProductKind {
  return (PRODUCT_KINDS as readonly string[]).includes(value);
}

/** Floral kinds that use the composition editor. */
export function productKindNeedsComposition(kind: ProductKind | null | undefined): boolean {
  return kind === 'BOUQUET' || kind === 'COMPOSITION' || kind === 'STEM';
}

/**
 * Mono/mixed are bouquet/composition classifications only.
 * STEM (поштучно), plants, gifts must never store or filter as mono bouquets.
 */
export function productKindUsesBouquetCompositionKind(
  kind: ProductKind | null | undefined,
): boolean {
  return kind === 'BOUQUET' || kind === 'COMPOSITION';
}

/** Persistable compositionKind from derived rows + product kind. */
export function resolveStoredCompositionKind(
  productKind: ProductKind | null | undefined,
  derived: CompositionKind,
): CompositionKind {
  if (!productKindUsesBouquetCompositionKind(productKind)) return 'UNKNOWN';
  return derived;
}

/** Suggest CatalogCategory.listingKind when manager picks a product kind. */
export function suggestedListingKindForProductKind(
  kind: ProductKind,
): CatalogListingKind {
  switch (kind) {
    case 'BOUQUET':
      return 'BOUQUETS';
    case 'COMPOSITION':
      return 'COMPOSITIONS';
    case 'STEM':
      return 'FLOWERS';
    case 'GIFT':
      return 'GIFTS';
    default:
      return 'OTHER';
  }
}

/** Primary commercial kinds shown in the product editor (PLANT/OTHER stay available as «Другое»). */
export const PRIMARY_PRODUCT_KINDS = [
  'BOUQUET',
  'COMPOSITION',
  'STEM',
  'GIFT',
] as const satisfies ReadonlyArray<ProductKind>;

/** Gift subtype (открытки, свечи, …) is the only merchandising pick managers still make. */
export function productKindNeedsGiftSubtype(kind: ProductKind | null | undefined): boolean {
  return kind === 'GIFT';
}

/** ProductKinds that belong on a CatalogCategory listingKind hub. */
export function productKindsForListingKind(
  listingKind: CatalogListingKind | null | undefined,
): ProductKind[] {
  switch (listingKind) {
    case 'BOUQUETS':
      return ['BOUQUET'];
    case 'COMPOSITIONS':
      return ['COMPOSITION'];
    case 'FLOWERS':
      return ['STEM'];
    case 'GIFTS':
      return ['GIFT'];
    default:
      return [];
  }
}

/**
 * Canonical root category slugs for commercial hubs (seed + PLP).
 * Leaf categories (розы, игрушки) are merchandising/SEO — not a second product type.
 */
export const CANONICAL_LISTING_HUB_SLUGS: Record<CatalogListingKind, string | null> = {
  BOUQUETS: 'bukety',
  COMPOSITIONS: 'kompozicii',
  FLOWERS: 'tsvety',
  GIFTS: 'podarki',
  OTHER: null,
};

export function isCanonicalListingHub(category: {
  slug: string;
  listingKind: CatalogListingKind | null | undefined;
}): boolean {
  if (!category.listingKind) return false;
  return CANONICAL_LISTING_HUB_SLUGS[category.listingKind] === category.slug;
}

/** Known merchandising leaf → compositionKind (monobukety). */
export const COMPOSITION_KIND_CATEGORY_SLUGS: Record<string, CompositionKind> = {
  monobukety: 'MONO',
};

/**
 * How a public /katalog/[slug] page should select products.
 * Canonical hubs: ProductKind only (stale catalogCategoryId must not pollute).
 * Flower leaves / monobukety: composition rules, not category assignment.
 * Other leaves (gift subtypes, merchandising): category tree only.
 */
export type CategoryListingScope = {
  /** Include products whose catalogCategoryId is in the expanded category tree. */
  useCategoryTree: boolean;
  productKinds?: ProductKind[];
  /**
   * When true with both tree and productKinds: OR them.
   * Prefer false — hubs must not OR stale categories.
   */
  matchCategoryOrProductKind?: boolean;
  scopeFlowerTypeSlugs?: string[];
  scopeCompositionKinds?: CompositionKind[];
};

export function resolveCategoryListingScope(category: {
  slug: string;
  parentId: string | null;
  listingKind: CatalogListingKind | null | undefined;
}): CategoryListingScope {
  if (isCanonicalListingHub(category)) {
    const kinds = productKindsForListingKind(category.listingKind);
    return {
      useCategoryTree: false,
      productKinds: kinds.length > 0 ? kinds : undefined,
      matchCategoryOrProductKind: false,
    };
  }

  if (category.listingKind === 'FLOWERS' && category.parentId) {
    return {
      useCategoryTree: false,
      productKinds: ['STEM'],
      scopeFlowerTypeSlugs: [category.slug],
    };
  }

  const compositionKind = COMPOSITION_KIND_CATEGORY_SLUGS[category.slug];
  if (compositionKind) {
    return {
      useCategoryTree: false,
      productKinds: ['BOUQUET', 'COMPOSITION'],
      scopeCompositionKinds: [compositionKind],
    };
  }

  // Gift subtypes (otkrytki, svechi, igrushki) and other merchandising leaves.
  return { useCategoryTree: true };
}

/** Compact storefront/admin summary line when classification is reliable. */
export function formatCompositionSummaryLine(input: {
  kind: CompositionKind;
  typeNames: string[];
  colorNames?: string[];
  productKind?: ProductKind | null;
}): string | null {
  if (!productKindUsesBouquetCompositionKind(input.productKind ?? 'BOUQUET')) {
    const types =
      input.typeNames.length === 0
        ? null
        : input.typeNames.length === 1
          ? input.typeNames[0]!
          : `${input.typeNames.length} вида`;
    const colors = input.colorNames?.filter(Boolean) ?? [];
    const palette =
      colors.length === 0
        ? null
        : colors.length === 1
          ? `${colors[0]} гамма`
          : 'Разноцветный';
    const line = [types, palette].filter(Boolean).join(' · ');
    return line || null;
  }
  if (input.kind === 'UNKNOWN') return null;
  const kindLabel = input.kind === 'MONO' ? 'Монобукет' : 'Смешанный букет';
  const types =
    input.typeNames.length === 0
      ? null
      : input.typeNames.length === 1
        ? input.typeNames[0]!
        : `${input.typeNames.length} вида`;
  const colors = input.colorNames?.filter(Boolean) ?? [];
  const palette =
    colors.length === 0
      ? null
      : colors.length === 1
        ? `${colors[0]} гамма`
        : 'Разноцветный';
  return [kindLabel, types, palette].filter(Boolean).join(' · ');
}

export const SEO_LANDING_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type SeoLandingStatus = (typeof SEO_LANDING_STATUSES)[number];

export const SLUG_ENTITY_TYPES = [
  'PRODUCT',
  'OCCASION',
  'RECIPIENT',
  'COLOR',
  'CATALOG_CATEGORY',
  'SEO_LANDING',
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

/**
 * Stem-height filter bands ("Высота цветка") — FlowerItem.heightCm only.
 * Half-open ranges so boundaries do not overlap:
 * <=50 | >50 && <=60 | >60 && <=70 | >70
 */
export const HEIGHT_BANDS = [
  { id: 'up_to_50', label: 'до 50 см', minExclusive: null, maxInclusive: 50 },
  { id: '50_60', label: '51–60 см', minExclusive: 50, maxInclusive: 60 },
  { id: '60_70', label: '61–70 см', minExclusive: 60, maxInclusive: 70 },
  { id: '70_plus', label: 'от 71 см', minExclusive: 70, maxInclusive: null },
] as const;
export type HeightBandId = (typeof HEIGHT_BANDS)[number]['id'];

/** Global catalog filter pool keys (definitions). */
export const CATALOG_FILTER_KEYS = [
  'price',
  'promo',
  'flower_type',
  'variety',
  'origin',
  'stem_height',
  'bouquet_height',
  'color',
  'quantity',
  'occasion',
  'recipient',
  'composition_kind',
] as const;
export type CatalogFilterKey = (typeof CATALOG_FILTER_KEYS)[number];

export const CATALOG_FILTER_TYPES = [
  'SELECT',
  'MULTI_SELECT',
  'RANGE',
  'TOGGLE',
  'CHECKBOX',
  'NUMBER_RANGE',
] as const;
export type CatalogFilterType = (typeof CATALOG_FILTER_TYPES)[number];

export const CATALOG_FILTER_PRESETS = ['FLOWERS', 'BOUQUETS', 'CARDS', 'CANDLES', 'OTHER'] as const;
export type CatalogFilterPreset = (typeof CATALOG_FILTER_PRESETS)[number];

export function isCatalogListingKind(value: string): value is CatalogListingKind {
  return (CATALOG_LISTING_KINDS as readonly string[]).includes(value);
}

export function isCatalogFilterKey(value: string): value is CatalogFilterKey {
  return (CATALOG_FILTER_KEYS as readonly string[]).includes(value);
}

export function isHeightBandId(value: string): value is HeightBandId {
  return HEIGHT_BANDS.some((band) => band.id === value);
}

/** Prisma IntFilter bounds for stem-height bands (non-overlapping). */
export function heightBandWhere(
  bandId: HeightBandId,
): { gt?: number; gte?: number; lte?: number } | null {
  const band = HEIGHT_BANDS.find((item) => item.id === bandId);
  if (!band) return null;
  const where: { gt?: number; gte?: number; lte?: number } = {};
  if (band.minExclusive != null) where.gt = band.minExclusive;
  if (band.maxInclusive != null) where.lte = band.maxInclusive;
  return Object.keys(where).length > 0 ? where : null;
}

/** Default filter keys enabled for a category listingKind / preset. */
export function defaultFilterKeysForPreset(preset: CatalogFilterPreset): CatalogFilterKey[] {
  switch (preset) {
    case 'FLOWERS':
      return ['price', 'promo', 'flower_type', 'variety', 'origin', 'stem_height', 'color'];
    case 'BOUQUETS':
      return ['price', 'promo', 'flower_type', 'color', 'composition_kind', 'occasion', 'recipient'];
    case 'CARDS':
      return ['price', 'occasion', 'recipient'];
    case 'CANDLES':
      return ['price', 'color', 'promo'];
    default:
      return ['price', 'promo', 'color', 'occasion', 'recipient'];
  }
}

export function listingKindToFilterPreset(
  listingKind: CatalogListingKind | null | undefined,
): CatalogFilterPreset {
  switch (listingKind) {
    case 'FLOWERS':
      return 'FLOWERS';
    case 'BOUQUETS':
    case 'COMPOSITIONS':
      return 'BOUQUETS';
    case 'GIFTS':
      return 'OTHER';
    default:
      return 'OTHER';
  }
}

/**
 * Strip listing filter fields that are not enabled for the category Filter Pool config.
 * Sort / search / pagination / category scope are never gated.
 */
export type GatedListingFilterFields = {
  flowerTypeIds?: string[];
  flowerTypeSlugs?: string[];
  flowerVarietyIds?: string[];
  flowerVarietySlugs?: string[];
  flowerOriginIds?: string[];
  flowerOriginSlugs?: string[];
  colorIds?: string[];
  colorSlugs?: string[];
  /** Component-line color (same-component AND with flower type). */
  componentColorIds?: string[];
  componentColorSlugs?: string[];
  occasionIds?: string[];
  occasionSlugs?: string[];
  recipientIds?: string[];
  recipientSlugs?: string[];
  heightCm?: { gt?: number; gte?: number; lte?: number };
  heightBand?: string;
  promotionalOnly?: boolean;
  minPriceMinor?: string;
  maxPriceMinor?: string;
  compositionKinds?: CompositionKind[];
  /** Min total PRIMARY qty for a flower type (EXACT compositions only). */
  minFlowerTypeQuantity?: number;
  flowerTypeQuantitySlug?: string;
};

export function gateListingFiltersByEnabledKeys<T extends GatedListingFilterFields>(
  filters: T,
  enabledKeys: ReadonlySet<CatalogFilterKey> | readonly CatalogFilterKey[],
): T {
  const keys = enabledKeys instanceof Set ? enabledKeys : new Set(enabledKeys);
  const next: GatedListingFilterFields = { ...filters };

  if (!keys.has('flower_type')) {
    delete next.flowerTypeIds;
    delete next.flowerTypeSlugs;
  }
  if (!keys.has('variety')) {
    delete next.flowerVarietyIds;
    delete next.flowerVarietySlugs;
  }
  if (!keys.has('origin')) {
    delete next.flowerOriginIds;
    delete next.flowerOriginSlugs;
  }
  if (!keys.has('color')) {
    delete next.colorIds;
    delete next.colorSlugs;
    delete next.componentColorIds;
    delete next.componentColorSlugs;
  }
  if (!keys.has('occasion')) {
    delete next.occasionIds;
    delete next.occasionSlugs;
  }
  if (!keys.has('recipient')) {
    delete next.recipientIds;
    delete next.recipientSlugs;
  }
  if (!keys.has('stem_height')) {
    delete next.heightCm;
    delete next.heightBand;
  }
  if (!keys.has('promo')) {
    delete next.promotionalOnly;
  }
  if (!keys.has('price')) {
    delete next.minPriceMinor;
    delete next.maxPriceMinor;
  }
  if (!keys.has('composition_kind')) {
    delete next.compositionKinds;
  }
  if (!keys.has('quantity')) {
    delete next.minFlowerTypeQuantity;
    delete next.flowerTypeQuantitySlug;
  }

  return next as T;
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

export type CatalogFilterDefinitionDto = {
  id: string;
  key: CatalogFilterKey;
  name: string;
  description: string | null;
  filterType: CatalogFilterType;
  sourceKey: string;
  supported: boolean;
  defaultEnabled: boolean;
  defaultSortOrder: number;
};

export type CatalogCategoryFilterConfigDto = {
  id: string;
  definitionId: string;
  key: CatalogFilterKey;
  name: string;
  label: string;
  filterType: CatalogFilterType;
  enabled: boolean;
  position: number;
  labelOverride: string | null;
  collapsed: boolean;
  version: number;
};

export type CatalogFilterOptionDto = {
  id: string;
  slug: string;
  name: string;
};

export type CatalogCategoryFilterPublicDto = {
  key: CatalogFilterKey;
  label: string;
  filterType: CatalogFilterType;
  collapsed: boolean;
  /** Omitted/empty for price/promo; slug options for facets; band ids for stem_height. */
  options: CatalogFilterOptionDto[];
};

export type FlowerTypeDto = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  seoTitle?: string | null;
  seoDescription?: string | null;
  noIndex?: boolean;
};

/** Admin list for flower types — includes usage for safe delete UX. */
export type FlowerTypeAdminDto = FlowerTypeDto & {
  version: number;
  productsCount: number;
  varietiesCount: number;
  /** Concrete FlowerItem rows under this type. */
  itemsCount?: number;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
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

export type FlowerFormDto = {
  id: string;
  flowerTypeId: string;
  slug: string;
  name: string;
  sortOrder: number;
  visibility: TaxonomyVisibility;
};

export type FlowerFormAdminDto = FlowerFormDto & {
  version: number;
  itemsCount: number;
};

/**
 * Concrete reusable stem/SKU: Type + optional Form + Variety + Origin + stem length.
 * Quantity is NEVER on FlowerItem — only on ProductComponent.
 */
export type FlowerItemDto = {
  id: string;
  flowerTypeId: string;
  flowerFormId: string | null;
  flowerVarietyId: string | null;
  flowerOriginId: string | null;
  /** Stem length in cm (FlowerItem). Not bouquet height. */
  stemLengthCm: number | null;
  slug: string;
  name: string;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  flowerType: TaxonomyRefDto;
  flowerForm: TaxonomyRefDto | null;
  flowerVariety: TaxonomyRefDto | null;
  flowerOrigin: TaxonomyRefDto | null;
};

export type FlowerItemAdminDto = FlowerItemDto & {
  version: number;
  /** Products that reference this item via ProductComponent. */
  componentsCount: number;
  identityKey: string;
  /** Populated on get-by-id: products using this flower in composition. */
  usedIn?: Array<{
    productId: string;
    productName: string;
    productSlug: string;
    quantity: number | null;
  }>;
};

/** Conflict payload when creating a duplicate FlowerItem. */
export type FlowerItemDuplicateConflictDto = {
  code: 'FLOWER_ITEM_DUPLICATE';
  message: string;
  existingId: string;
  existingName: string;
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
  flowerFormId?: string | null;
  flowerVarietyId?: string | null;
  flowerOriginId?: string | null;
  stemLengthCm?: number | null;
  /** @deprecated Use stemLengthCm */
  heightCm?: number | null;
}): string {
  const stem = input.stemLengthCm ?? input.heightCm;
  return [
    input.flowerTypeId,
    input.flowerFormId ?? '_',
    input.flowerVarietyId ?? '_',
    input.flowerOriginId ?? '_',
    stem == null ? '_' : String(stem),
  ].join('|');
}

/**
 * Canonical FlowerItem label — single SoT for admin + storefront.
 * Format: "{Type} {Variety} {stem} см {Origin}" — form omitted from default retail label
 * (form is a manager/filter attribute; name stays short for shoppers).
 * e.g. "Роза Мондиаль 60 см Эквадор"
 */
export function flowerItemDisplayName(input: {
  typeName: string;
  formName?: string | null;
  varietyName?: string | null;
  originName?: string | null;
  stemLengthCm?: number | null;
  /** @deprecated Use stemLengthCm */
  heightCm?: number | null;
}): string {
  const stem = input.stemLengthCm ?? input.heightCm;
  const parts: string[] = [input.typeName.trim()];
  if (input.varietyName?.trim()) parts.push(input.varietyName.trim());
  if (stem != null) parts.push(`${stem} см`);
  if (input.originName?.trim()) parts.push(input.originName.trim());
  return parts.filter(Boolean).join(' ');
}

/** ProductComponent must reference a FlowerItem. */
export function assertComponentFlowerRefXor(input: {
  flowerItemId?: string | null;
}): { flowerItemId: string } {
  const flowerItemId = input.flowerItemId?.trim() ? input.flowerItemId.trim() : null;
  if (!flowerItemId) {
    throw new Error('COMPONENT_NO_REF');
  }
  return { flowerItemId };
}

/** Default in-card variant name for new products (manager-facing). */
export const DEFAULT_PRODUCT_VARIANT_NAME = 'Стандарт';

/** Genitive plural hints for commercial bouquet titles (deterministic, not AI). */
const FLOWER_TYPE_GENITIVE: Record<string, string> = {
  роза: 'роз',
  эустома: 'эустомы',
  эвкалипт: 'эвкалипта',
  хризантема: 'хризантем',
  гипсофила: 'гипсофилы',
  тюльпан: 'тюльпанов',
  лилия: 'лилий',
  пион: 'пионов',
  орхидея: 'орхидей',
  гербера: 'гербер',
};

function flowerTypeGenitive(typeName: string): string {
  const trimmed = typeName.trim();
  if (!trimmed) return '';
  const mapped = FLOWER_TYPE_GENITIVE[trimmed.toLowerCase()];
  return mapped ?? trimmed.toLowerCase();
}

function joinGenitiveTypes(types: string[]): string {
  const parts = types.map(flowerTypeGenitive).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} и ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`;
}

function inferCompositionTypeName(row: {
  displayName: string;
  typeName?: string | null;
}): string {
  const explicit = row.typeName?.trim();
  if (explicit) return explicit;
  const first = row.displayName.trim().split(/\s+/)[0];
  return first ?? row.displayName.trim();
}

function inferCompositionVarietyName(row: {
  displayName: string;
  typeName?: string | null;
  varietyName?: string | null;
}): string {
  const explicit = row.varietyName?.trim();
  if (explicit) return explicit;
  const type = inferCompositionTypeName(row);
  const parts = row.displayName.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] === type) return parts[1] ?? '';
  return '';
}

/**
 * Derive mono/mixed from PRIMARY composition lines only.
 * GREENERY / FILLER / OTHER never break mono.
 * Empty or only non-primary → UNKNOWN.
 */
export function deriveCompositionKind(
  rows: Array<{
    role?: ComponentRole | null;
    typeId?: string | null;
    typeName?: string | null;
    flowerItem?: { flowerTypeId?: string | null; flowerType?: { id?: string; name?: string } | null } | null;
  }>,
): CompositionKind {
  const primary = rows.filter((row) => (row.role ?? 'PRIMARY') === 'PRIMARY');
  if (primary.length === 0) return 'UNKNOWN';

  const typeKeys = new Set<string>();
  for (const row of primary) {
    const key =
      row.typeId?.trim() ||
      row.flowerItem?.flowerTypeId?.trim() ||
      row.flowerItem?.flowerType?.id?.trim() ||
      row.typeName?.trim().toLowerCase() ||
      row.flowerItem?.flowerType?.name?.trim().toLowerCase() ||
      '';
    if (key) typeKeys.add(key);
  }
  if (typeKeys.size === 0) return 'UNKNOWN';
  if (typeKeys.size === 1) return 'MONO';
  return 'MIXED';
}

/** Suggest product-level visual palette color ids from component line colors (unique, order preserved). */
export function suggestVisualPaletteColorIds(
  rows: Array<{ role?: ComponentRole | null; colorId?: string | null }>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const role = row.role ?? 'PRIMARY';
    if (role === 'GREENERY') continue;
    const id = row.colorId?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function isComponentRole(value: string): value is ComponentRole {
  return (COMPONENT_ROLES as readonly string[]).includes(value);
}

export function isCompositionKind(value: string): value is CompositionKind {
  return (COMPOSITION_KINDS as readonly string[]).includes(value);
}

export function isCompositionPrecision(value: string): value is CompositionPrecision {
  return (COMPOSITION_PRECISIONS as readonly string[]).includes(value);
}

/** Suggest a product name from composition rows (manager confirms — never auto-applied). */
export function suggestProductNameFromComposition(
  rows: Array<{
    displayName: string;
    quantity: number | null;
    typeName?: string | null;
    varietyName?: string | null;
  }>,
): string {
  const usable = rows.filter((row) => row.displayName.trim().length > 0);
  if (usable.length === 0) return '';

  if (usable.length === 1) {
    const row = usable[0]!;
    const qty = row.quantity && row.quantity > 0 ? row.quantity : null;
    const type = inferCompositionTypeName(row);
    const label = row.displayName.trim();
    const variety = inferCompositionVarietyName(row);
    if (qty && qty > 1) {
      if (variety) return `Букет из ${flowerTypeGenitive(type)} ${variety}`;
      return `Букет из ${qty} ${label}`;
    }
    if (variety) return `${type} ${variety}`;
    return label;
  }

  const types = [...new Set(usable.map((row) => inferCompositionTypeName(row)))];
  if (types.length >= 4) return 'Авторский букет';

  if (types.length === 1) {
    const type = types[0]!;
    const varieties = [
      ...new Set(usable.map((row) => inferCompositionVarietyName(row)).filter(Boolean)),
    ];
    if (varieties.length >= 3) {
      return `Букет из ${flowerTypeGenitive(type)} разных сортов`;
    }
    if (varieties.length === 2) {
      return `Букет из ${flowerTypeGenitive(type)} ${varieties[0]} и ${varieties[1]}`;
    }
    if (varieties.length === 1) {
      return `Букет из ${flowerTypeGenitive(type)} ${varieties[0]}`;
    }
    return `Букет из ${flowerTypeGenitive(type)}`;
  }

  return `Букет из ${joinGenitiveTypes(types)}`;
}

export type CompositionManagerSummary = {
  flowerTypes: string[];
  varieties: string[];
  origins: string[];
  stemLengthLabel: string | null;
};

/** Read-only summary for managers — derived from FlowerItem-linked composition rows. */
export function deriveCompositionManagerSummary(
  rows: Array<{
    typeName?: string | null;
    varietyName?: string | null;
    originName?: string | null;
    stemLengthCm?: number | null;
    flowerItem?: {
      flowerType?: { name: string } | null;
      flowerVariety?: { name: string } | null;
      flowerOrigin?: { name: string } | null;
      stemLengthCm?: number | null;
    } | null;
  }>,
): CompositionManagerSummary {
  const types = new Set<string>();
  const varieties = new Set<string>();
  const origins = new Set<string>();
  const stems: number[] = [];

  for (const row of rows) {
    const type =
      row.typeName?.trim() ||
      row.flowerItem?.flowerType?.name?.trim() ||
      '';
    const variety =
      row.varietyName?.trim() ||
      row.flowerItem?.flowerVariety?.name?.trim() ||
      '';
    const origin =
      row.originName?.trim() ||
      row.flowerItem?.flowerOrigin?.name?.trim() ||
      '';
    const stem = row.stemLengthCm ?? row.flowerItem?.stemLengthCm ?? null;
    if (type) types.add(type);
    if (variety) varieties.add(variety);
    if (origin) origins.add(origin);
    if (stem != null && Number.isFinite(stem)) stems.push(stem);
  }

  stems.sort((a, b) => a - b);
  let stemLengthLabel: string | null = null;
  if (stems.length === 1) stemLengthLabel = `${stems[0]} см`;
  else if (stems.length > 1) {
    stemLengthLabel = `${stems[0]}–${stems[stems.length - 1]} см`;
  }

  return {
    flowerTypes: [...types],
    varieties: [...varieties],
    origins: [...origins],
    stemLengthLabel,
  };
}

export type ProductEditorReadinessItem = {
  id: string;
  label: string;
  ok: boolean;
  requiredForPublish: boolean;
};

/** Parse major BYN input for readiness; null = unset/invalid. Zero is unset for commerce. */
export function parsePositivePriceMajor(raw: string | null | undefined): number | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Mirrors backend publish validation + helpful draft hints for the admin editor. */
export function deriveProductEditorReadiness(input: {
  name: string;
  slug?: string | null;
  catalogCategoryId: string | null;
  productKind?: ProductKind | null;
  variants: Array<{ status: string; priceMajor: string | null | undefined }>;
  hasPrimaryImage: boolean;
  shortDescription: string | null | undefined;
  description: string | null | undefined;
  compositionHasFlowerItem: boolean;
}): {
  items: ProductEditorReadinessItem[];
  readyToPublish: boolean;
  blockingLabels: string[];
  /** Issues that block publish — empty when ready. */
  issues: Array<{ id: string; label: string }>;
} {
  const needsComposition = productKindNeedsComposition(input.productKind ?? 'BOUQUET');
  const nameOk = input.name.trim().length > 0;
  const slugOk = (input.slug ?? '').trim().length >= 2;
  const activeVariants = input.variants.filter((v) => v.status === 'ACTIVE');
  const priceOk =
    activeVariants.length > 0 &&
    activeVariants.every((v) => parsePositivePriceMajor(v.priceMajor) !== null);
  const photoOk = input.hasPrimaryImage;
  const shortOk = Boolean(input.shortDescription?.trim());
  const longOk = Boolean(input.description?.trim());
  const compositionOk = !needsComposition || input.compositionHasFlowerItem;
  // Category is no longer a commercial type — ProductKind is SSoT. Gift subtype is optional.

  const items: ProductEditorReadinessItem[] = [
    { id: 'name', label: 'Название', ok: nameOk, requiredForPublish: true },
    { id: 'slug', label: 'Адрес в ссылке', ok: slugOk, requiredForPublish: true },
    { id: 'shortDescription', label: 'Короткое описание', ok: shortOk, requiredForPublish: true },
    { id: 'description', label: 'Полное описание', ok: longOk, requiredForPublish: false },
    { id: 'price', label: 'Цена', ok: priceOk, requiredForPublish: true },
    { id: 'photo', label: 'Основное фото', ok: photoOk, requiredForPublish: true },
    {
      id: 'composition',
      label: needsComposition ? 'Состав' : 'Состав (не нужен)',
      ok: compositionOk,
      requiredForPublish: needsComposition,
    },
  ];

  const issues = items
    .filter((item) => item.requiredForPublish && !item.ok)
    .map((item) => ({ id: item.id, label: item.label }));

  const blockingLabels = issues.map((item) => item.label.toLowerCase());
  const readyToPublish = issues.length === 0;

  return { items, readyToPublish, blockingLabels, issues };
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
  flowerItemId: string;
  flowerItem: FlowerItemDto | null;
  colorId: string | null;
  color: TaxonomyRefDto | null;
  role: ComponentRole;
  displayName: string;
  quantity: number | null;
  unit: ComponentUnit;
  sortOrder: number;
};

/** Managed SEO landing page (Admin + public). */
export type SeoLandingPageDto = {
  id: string;
  slug: string;
  title: string;
  h1: string;
  seoTitle: string | null;
  seoDescription: string | null;
  body: string | null;
  /** Catalog list filter shape (JSON-compatible). */
  rules: Record<string, unknown>;
  status: SeoLandingStatus;
  noIndex: boolean;
  navVisible: boolean;
  sortOrder: number;
  version: number;
  publishedAt: string | null;
  pinnedProductIds: string[];
  excludedProductIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type SeoLandingPagePublicDto = {
  id: string;
  slug: string;
  title: string;
  h1: string;
  seoTitle: string | null;
  seoDescription: string | null;
  body: string | null;
  noIndex: boolean;
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
  /** Bouquet/card height in cm (Product.heightCm). Stem height lives on FlowerItem. */
  heightCm: number | null;
  catalogCategory: TaxonomyRefDto | null;
  family: { id: string; name: string } | null;
  /** Presentation helper for storefront cards. */
  cardSubtitle: string | null;
  price: PriceRangeDto | null;
  promotion: ProductPromotionPublicDto | null;
  /** Cheapest active variant for quick-add (effective promotional price). */
  defaultVariant: { id: string; name: string; priceMinor: string } | null;
  primaryImageUrl: string | null;
  colors: TaxonomyRefDto[];
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
  /** @deprecated Not shown in admin; retained for API compatibility. */
  diameterCm: number | null;
  productKind: ProductKind;
  compositionKind: CompositionKind;
  compositionPrecision: CompositionPrecision;
  catalogCategoryId: string | null;
  catalogCategory: TaxonomyRefDto | null;
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
  /** Visual palette of the bouquet (not per-component color). */
  colors: TaxonomyRefDto[];
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
  productKind: ProductKind;
  compositionKind: CompositionKind;
  catalogCategory: TaxonomyRefDto | null;
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
    role: ComponentRole;
    flowerSlug: string | null;
    colorSlug: string | null;
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

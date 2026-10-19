import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  COMMERCIAL_AVAILABILITIES,
  COMPONENT_ROLES,
  COMPONENT_UNITS,
  COMPOSITION_KINDS,
  COMPOSITION_PRECISIONS,
  PRODUCT_KINDS,
  PRODUCT_LIFECYCLES,
  PRODUCT_SORTS,
  PROMOTION_TYPES,
  VARIANT_STATUSES,
  type CommercialAvailability,
  type ComponentRole,
  type ComponentUnit,
  type CompositionKind,
  type CompositionPrecision,
  type ProductKind,
  type ProductLifecycle,
  type ProductSort,
  type PromotionType,
  type VariantStatus,
} from '@bouquet-one/contracts';
import { MEDIA_ALT_MAX_LENGTH, PRODUCT_MEDIA_MAX } from '../media/media.constants';

const PRICE_MINOR_PATTERN = /^\d{1,15}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const FACET_LIST_MAX = 16;

/** Multipart and query values arrive as strings; keep `undefined` absent. */
export const toOptionalBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === '1';
};

/** Accepts `?a=1,2` and repeated `?a=1&a=2` for multi-select facets. */
export const toStringList = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const parts = raw
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0 && entry.length <= 120);
  if (parts.length === 0) return undefined;
  return [...new Set(parts)].slice(0, FACET_LIST_MAX);
};

export class ExpectedVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ProductVariantInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(PRICE_MINOR_PATTERN, { message: 'priceMinor must be integer minor units as a string' })
  priceMinor!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(VARIANT_STATUSES)
  status?: VariantStatus;
}

/**
 * Editor variant row: FIXED sale price is bound to this object (not a separate
 * variantId list). Server creates the variant then attaches salePriceMinor to the
 * new id inside the same transaction.
 */
export class EditorVariantInputDto extends ProductVariantInputDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, {
    message: 'salePriceMinor must be integer minor units as a string',
  })
  salePriceMinor?: string | null;
}

export class EditorPromotionInputDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(PROMOTION_TYPES)
  type!: PromotionType;

  @ValidateIf((o: EditorPromotionInputDto) => o.type === 'PERCENT')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  percentOff?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  endsAt?: string | null;
}

/** Full product-editor snapshot — one OCC check, one transaction. */
export class SaveProductEditorDto extends ExpectedVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  slug!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  shortDescription?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  badgeLabel?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsIn(COMMERCIAL_AVAILABILITIES)
  availability!: CommercialAvailability;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null) return null;
    if (value === undefined) return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(15)
  @Max(250)
  heightCm?: number | null;

  @IsOptional()
  @IsIn(PRODUCT_KINDS)
  productKind?: ProductKind;

  /** @deprecated Ignored by editor; retained for API compatibility. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null) return null;
    if (value === undefined) return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(5)
  @Max(250)
  diameterCm?: number | null;

  @IsOptional()
  @IsIn(COMPOSITION_PRECISIONS)
  compositionPrecision?: CompositionPrecision;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  seoTitle?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  @IsBoolean()
  noIndex!: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  publishAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  unpublishAt?: string | null;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => EditorVariantInputDto)
  variants!: EditorVariantInputDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductComponentInputDto)
  components!: ProductComponentInputDto[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  catalogCategoryId?: string | null;

  /** null clears family membership; omit to leave unchanged. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  familyId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  familyMemberSortOrder?: number;

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  occasionIds!: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  recipientIds!: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  colorIds!: string[];

  /** ProductTraitDefinition.key values (e.g. AUTHORIAL). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  traitKeys?: string[];

  @ValidateNested()
  @Type(() => EditorPromotionInputDto)
  promotion!: EditorPromotionInputDto;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  groupIds!: string[];
}

export class ProductComponentInputDto {
  @IsUUID()
  flowerItemId!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  colorId?: string | null;

  @IsOptional()
  @IsIn(COMPONENT_ROLES)
  role?: ComponentRole;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  displayName!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(10_000)
  quantity?: number | null;

  @IsOptional()
  @IsIn(COMPONENT_UNITS)
  unit?: ComponentUnit;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string;

  @IsOptional()
  @IsIn(COMMERCIAL_AVAILABILITIES)
  availability?: CommercialAvailability;

  /** Bouquet height in cm; omit/null = hide on storefront. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsInt()
  @Min(15)
  @Max(250)
  heightCm?: number;

  @IsOptional()
  @Matches(CURRENCY_PATTERN, { message: 'currency must be an ISO 4217 code' })
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;

  @IsOptional()
  @IsIn(PRODUCT_KINDS)
  productKind?: ProductKind;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantInputDto)
  variants?: ProductVariantInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  occasionIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  recipientIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  colorIds?: string[];
}

export class UpdateProductDto extends ExpectedVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  shortDescription?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  badgeLabel?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsIn(COMMERCIAL_AVAILABILITIES)
  availability?: CommercialAvailability;

  /** Set null to clear height from storefront. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null) return null;
    if (value === undefined) return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(15)
  @Max(250)
  heightCm?: number | null;

  @IsOptional()
  @Matches(CURRENCY_PATTERN, { message: 'currency must be an ISO 4217 code' })
  currency?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  seoTitle?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  publishAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  unpublishAt?: string | null;
}

export class SetProductVariantsDto extends ExpectedVersionDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantInputDto)
  variants!: ProductVariantInputDto[];
}

export class SetProductComponentsDto extends ExpectedVersionDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductComponentInputDto)
  components!: ProductComponentInputDto[];
}

export class SetProductTaxonomiesDto extends ExpectedVersionDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  occasionIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  recipientIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  colorIds?: string[];
}

export class SetProductBestsellerGroupsDto extends ExpectedVersionDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  groupIds!: string[];
}

export class PromotionVariantPriceInputDto {
  @IsUUID()
  variantId!: string;

  @IsString()
  @Matches(PRICE_MINOR_PATTERN, {
    message: 'salePriceMinor must be integer minor units as a string',
  })
  salePriceMinor!: string;
}

export class UpsertProductPromotionDto extends ExpectedVersionDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(PROMOTION_TYPES)
  type!: PromotionType;

  /** Required for PERCENT (1–99) — matches DB product_promotions_type_fields. */
  @ValidateIf((o: UpsertProductPromotionDto) => o.type === 'PERCENT')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  percentOff?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  endsAt?: string | null;

  /** Required for FIXED promotions: sale price per active variant. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PromotionVariantPriceInputDto)
  variantSalePrices?: PromotionVariantPriceInputDto[];
}

export class PublishProductDto extends ExpectedVersionDto {
  @IsOptional()
  @IsDateString()
  publishAt?: string;

  @IsOptional()
  @IsDateString()
  unpublishAt?: string;
}

export class UploadProductMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(MEDIA_ALT_MAX_LENGTH)
  alt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isPrimary?: boolean;

  /** Accepted for Admin FormData compatibility; media mutations do not enforce OCC. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class UpdateProductMediaDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MEDIA_ALT_MAX_LENGTH)
  alt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  caption?: string | null;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class ReorderProductMediaDto {
  @IsArray()
  @ArrayMaxSize(PRODUCT_MEDIA_MAX)
  @IsUUID(undefined, { each: true })
  mediaIds!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

/** Facet filters shared by admin and public product lists (OR within, AND across). */
class ProductFacetQueryDto {
  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  budgetRangeIds?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  occasionIds?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @MaxLength(120, { each: true })
  occasionSlugs?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  recipientIds?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @MaxLength(120, { each: true })
  recipientSlugs?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  colorIds?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @MaxLength(120, { each: true })
  colorSlugs?: string[];

  /** Composition-line color (same-component AND with flower type). */
  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  componentColorIds?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @MaxLength(120, { each: true })
  componentColorSlugs?: string[];

  /** /cvety rewrite: flower-type slug matched via FlowerItem composition. */
  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @MaxLength(120, { each: true })
  flowerSlugs?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    const list = toStringList({ value });
    if (!list) return undefined;
    const map: Record<string, CompositionKind> = {
      mono: 'MONO',
      mixed: 'MIXED',
      unknown: 'UNKNOWN',
      MONO: 'MONO',
      MIXED: 'MIXED',
      UNKNOWN: 'UNKNOWN',
    };
    const out: CompositionKind[] = [];
    for (const item of list) {
      const kind = map[item];
      if (kind && !out.includes(kind)) out.push(kind);
    }
    return out.length > 0 ? out : undefined;
  })
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsIn(COMPOSITION_KINDS, { each: true })
  compositionKind?: CompositionKind[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  minFlowerTypeQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  flowerTypeQuantitySlug?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  promotionalOnly?: boolean;

  @IsOptional()
  @IsUUID()
  catalogCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categorySlug?: string;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  flowerTypeId?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @MaxLength(120, { each: true })
  flowerTypeSlug?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  flowerVarietyId?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @MaxLength(120, { each: true })
  flowerVarietySlug?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  flowerOriginId?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @MaxLength(120, { each: true })
  flowerOriginSlug?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  heightBand?: string;

  @IsOptional()
  @IsUUID()
  familyId?: string;

  /** Admin list filter — single commercial kind. Public hubs use categorySlug. */
  @IsOptional()
  @IsIn(PRODUCT_KINDS)
  productKind?: ProductKind;
}

export class ProductListQueryDto extends ProductFacetQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsIn(PRODUCT_LIFECYCLES)
  lifecycle?: ProductLifecycle;

  @IsOptional()
  @IsIn(COMMERCIAL_AVAILABILITIES)
  availability?: CommercialAvailability;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  bestsellerGroupIds?: string[];

  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort = 'recommended';
}

export class PublicProductListQueryDto extends ProductFacetQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  pageSize?: number = 24;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsIn(COMMERCIAL_AVAILABILITIES)
  availability?: CommercialAvailability;

  @IsOptional()
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, {
    message: 'minPriceMinor must be integer minor units as a string',
  })
  minPriceMinor?: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, {
    message: 'maxPriceMinor must be integer minor units as a string',
  })
  maxPriceMinor?: string;

  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort = 'recommended';
}

export class RelatedProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit?: number = 8;
}

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
  COMPONENT_UNITS,
  PRODUCT_LIFECYCLES,
  PRODUCT_SORTS,
  PROMOTION_TYPES,
  VARIANT_STATUSES,
  type CommercialAvailability,
  type ComponentUnit,
  type ProductLifecycle,
  type ProductSort,
  type PromotionType,
  type VariantStatus,
} from '@bouquet-one/contracts';

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

export class ProductComponentInputDto {
  @IsOptional()
  @IsUUID()
  flowerId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  displayName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  quantity?: number;

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
  @IsUUID()
  bouquetSizeId?: string;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  productLineIds?: string[];
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

  /** Set null to detach the bouquet size. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  bouquetSizeId?: string | null;

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
  @IsDateString()
  publishAt?: string;

  @IsOptional()
  @IsDateString()
  unpublishAt?: string;
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  productLineIds?: string[];

  /** Explicit null detaches the bouquet size; omit to leave unchanged. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  bouquetSizeId?: string | null;
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

  /** Required for PERCENT promotions (1–99). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
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
  @MaxLength(300)
  alt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateProductMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

export class ReorderProductMediaDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  mediaIds!: string[];
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

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  flowerIds?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @MaxLength(120, { each: true })
  flowerSlugs?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @IsUUID(undefined, { each: true })
  bouquetSizeIds?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(FACET_LIST_MAX)
  @MaxLength(120, { each: true })
  bouquetSizeSlugs?: string[];

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  promotionalOnly?: boolean;
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

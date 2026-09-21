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
  ValidateNested,
} from 'class-validator';
import {
  COMMERCIAL_AVAILABILITIES,
  COMPONENT_UNITS,
  PRODUCT_LIFECYCLES,
  PRODUCT_SORTS,
  VARIANT_STATUSES,
  type CommercialAvailability,
  type ComponentUnit,
  type ProductLifecycle,
  type ProductSort,
  type VariantStatus,
} from '@bouquet-one/contracts';

const PRICE_MINOR_PATTERN = /^\d{1,15}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Multipart and query values arrive as strings; keep `undefined` absent. */
export const toOptionalBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === '1';
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

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

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
  categoryIds?: string[];
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

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

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
  categoryIds?: string[];

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
  styleIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  colorIds?: string[];
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

export class ProductListQueryDto {
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
  @Transform(toOptionalBoolean)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class PublicProductListQueryDto {
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
  @Transform(toOptionalBoolean)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categorySlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  occasionSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  styleSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  colorSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  flowerSlug?: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, { message: 'minPriceMinor must be integer minor units as a string' })
  minPriceMinor?: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, { message: 'maxPriceMinor must be integer minor units as a string' })
  maxPriceMinor?: string;

  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort = 'featured';
}

export class RelatedProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit?: number = 8;
}

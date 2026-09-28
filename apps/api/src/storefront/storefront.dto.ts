import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { HOMEPAGE_SECTION_KINDS } from '@bouquet-one/contracts';

export class UpdateStorefrontSettingsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  brandName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  workingHours?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  deliverySummary?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  aboutSummary?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  instagramUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  telegramUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  substitutionNote?: string | null;
}

export class HomepageHeroInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subtitle!: string;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  imageUrl!: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  ctaLabel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  ctaHref!: string;
}

export class HomepageSectionInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  id!: string;

  @IsIn([...HOMEPAGE_SECTION_KINDS])
  kind!: (typeof HOMEPAGE_SECTION_KINDS)[number];

  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  heading!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder!: number;
}

export class UpdateHomepageConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ValidateNested()
  @Type(() => HomepageHeroInputDto)
  hero!: HomepageHeroInputDto;

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => HomepageSectionInputDto)
  sections!: HomepageSectionInputDto[];
}

export class CreateInstagramPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  imageUrl!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  postUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  caption?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class UpdateInstagramPostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  postUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  caption?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class ReorderInstagramPostsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  orderedIds!: string[];
}

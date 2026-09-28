import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TAXONOMY_VISIBILITIES, type TaxonomyVisibility } from '@bouquet-one/contracts';
import type { Request } from 'express';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { ExpectedVersionDto } from './products.dto';
import { TAXONOMY_KINDS, TaxonomyService, type TaxonomyKind } from './taxonomy.service';

class TaxonomyListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(TAXONOMY_VISIBILITIES)
  visibility?: TaxonomyVisibility;
}

/** Hex color or a plain CSS keyword — complex palettes may leave it empty. */
const SWATCH_PATTERN = /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|[a-z]{3,24})$/;

class CreateTaxonomyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(TAXONOMY_VISIBILITIES)
  visibility?: TaxonomyVisibility;

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

  /** Colors only; ignored for other kinds. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(32)
  @Matches(SWATCH_PATTERN, { message: 'swatch must be a hex color or CSS color keyword' })
  swatch?: string | null;
}

class UpdateTaxonomyDto extends ExpectedVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(TAXONOMY_VISIBILITIES)
  visibility?: TaxonomyVisibility;

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

  /** Colors only; ignored for other kinds. Explicit null clears the swatch. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(32)
  @Matches(SWATCH_PATTERN, { message: 'swatch must be a hex color or CSS color keyword' })
  swatch?: string | null;
}

/**
 * One controller for every taxonomy: `/admin/catalog/{flowers|occasions|recipients|colors|bouquet-sizes|product-lines}`.
 * Registered after the product, promotion, bestseller and budget-range controllers
 * so their concrete paths win over the `:kind` parameter.
 */
@ApiTags('admin-catalog-taxonomy')
@Controller('admin/catalog')
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get(':kind')
  @RequirePermissions('CATALOG_READ')
  list(
    @Param('kind', new ParseEnumPipe(TAXONOMY_KINDS)) kind: TaxonomyKind,
    @Query() query: TaxonomyListQueryDto,
  ) {
    return this.taxonomy.list(kind, query);
  }

  @Post(':kind')
  @RequirePermissions('CATALOG_CREATE')
  create(
    @Param('kind', new ParseEnumPipe(TAXONOMY_KINDS)) kind: TaxonomyKind,
    @Body() body: CreateTaxonomyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.taxonomy.create(kind, body, actorFrom(admin, req));
  }

  @Get(':kind/:id')
  @RequirePermissions('CATALOG_READ')
  get(
    @Param('kind', new ParseEnumPipe(TAXONOMY_KINDS)) kind: TaxonomyKind,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taxonomy.getById(kind, id);
  }

  @Patch(':kind/:id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('kind', new ParseEnumPipe(TAXONOMY_KINDS)) kind: TaxonomyKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTaxonomyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.taxonomy.update(kind, id, body, actorFrom(admin, req));
  }
}

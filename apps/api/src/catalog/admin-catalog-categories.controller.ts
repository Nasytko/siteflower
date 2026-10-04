import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RequirePermissions } from '../auth/decorators';
import { CATALOG_LISTING_KINDS } from '@bouquet-one/contracts';
import { CatalogCategoriesService } from './catalog-categories.service';
import { ExpectedVersionDto } from './products.dto';

class CreateCatalogCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(CATALOG_LISTING_KINDS)
  listingKind?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

class UpdateCatalogCategoryDto extends ExpectedVersionDto {
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
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(CATALOG_LISTING_KINDS)
  listingKind?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(['VISIBLE', 'HIDDEN'])
  visibility?: 'VISIBLE' | 'HIDDEN';

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
}

@ApiTags('admin-catalog')
@Controller('admin/catalog/categories')
export class AdminCatalogCategoriesController {
  constructor(private readonly categories: CatalogCategoriesService) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list() {
    return this.categories.listAdmin();
  }

  @Get('tree')
  @RequirePermissions('CATALOG_READ')
  tree() {
    return this.categories.tree(false);
  }

  @Post()
  @RequirePermissions('CATALOG_UPDATE')
  create(@Body() body: CreateCatalogCategoryDto) {
    return this.categories.create(body);
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateCatalogCategoryDto) {
    return this.categories.update(id, body);
  }
}

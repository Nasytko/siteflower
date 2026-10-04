import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { Request } from 'express';
import { CATALOG_LISTING_KINDS } from '@bouquet-one/contracts';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
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

class ReorderCategoryDto extends ExpectedVersionDto {
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}

class ReassignAndDeleteCategoryDto extends ExpectedVersionDto {
  @IsUUID()
  targetCategoryId!: string;
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
  @RequirePermissions('CATALOG_CREATE')
  create(
    @Body() body: CreateCatalogCategoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.categories.create(body, actorFrom(admin, req));
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCatalogCategoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.categories.update(id, body, actorFrom(admin, req));
  }

  @Post(':id/reorder')
  @RequirePermissions('CATALOG_UPDATE')
  reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReorderCategoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.categories.reorderSibling(id, body.direction, body.expectedVersion, actorFrom(admin, req));
  }

  @Delete(':id')
  @RequirePermissions('CATALOG_UPDATE')
  deleteEmpty(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.categories.deleteEmpty(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Post(':id/reassign-and-delete')
  @RequirePermissions('CATALOG_UPDATE')
  reassignAndDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReassignAndDeleteCategoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.categories.reassignProductsAndDelete(id, body, actorFrom(admin, req));
  }
}

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators';
import { CatalogCategoriesService } from './catalog-categories.service';

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
  create(
    @Body()
    body: {
      name: string;
      slug?: string;
      parentId?: string | null;
      listingKind?: string | null;
      sortOrder?: number;
    },
  ) {
    return this.categories.create(body);
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      expectedVersion: number;
      name?: string;
      slug?: string;
      parentId?: string | null;
      listingKind?: string | null;
      sortOrder?: number;
      visibility?: 'VISIBLE' | 'HIDDEN';
      seoTitle?: string | null;
      seoDescription?: string | null;
      noIndex?: boolean;
    },
  ) {
    return this.categories.update(id, body);
  }
}

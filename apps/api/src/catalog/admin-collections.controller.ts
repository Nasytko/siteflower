import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { CollectionRulesDto } from '@bouquet-one/contracts';
import { getRequestId } from '../common/middleware/request-id.middleware';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { CreateCollectionDto, UpdateCollectionDto } from './catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('admin-catalog-collections')
@Controller('admin/catalog/collections')
export class AdminCollectionsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list() {
    return this.catalog.listCollections();
  }

  @Post()
  @RequirePermissions('CATALOG_CREATE')
  create(
    @Body() body: CreateCollectionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.catalog.createCollection({
      name: body.name,
      slug: body.slug,
      type: body.type,
      rules: (body.rules as CollectionRulesDto) ?? null,
      actorId: admin.id,
      requestId: getRequestId(req),
    });
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCollectionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.catalog.updateCollection({
      id,
      expectedVersion: body.expectedVersion,
      name: body.name,
      slug: body.slug,
      description: body.description,
      type: body.type,
      rules: (body.rules as CollectionRulesDto) ?? null,
      visibility: body.visibility,
      sortOrder: body.sortOrder,
      productIds: body.productIds,
      seoTitle: body.seoTitle,
      seoDescription: body.seoDescription,
      noIndex: body.noIndex,
      actorId: admin.id,
      requestId: getRequestId(req),
    });
  }

  @Post('preview-rules')
  @RequirePermissions('CATALOG_READ')
  previewRules(@Body() body: { rules: CollectionRulesDto }) {
    return this.catalog.previewCollectionMatches(body.rules ?? {});
  }
}

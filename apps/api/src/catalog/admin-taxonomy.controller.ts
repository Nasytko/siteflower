import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getRequestId } from '../common/middleware/request-id.middleware';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { CreateTaxonomyDto, UpdateTaxonomyDto } from './catalog.dto';
import { CatalogService } from './catalog.service';

const KINDS = new Set(['flowers', 'categories', 'occasions', 'recipients', 'styles', 'colors']);

@ApiTags('admin-catalog-taxonomies')
@Controller('admin/catalog')
export class AdminTaxonomyController {
  constructor(private readonly catalog: CatalogService) {}

  @Get(':kind')
  @RequirePermissions('CATALOG_READ')
  list(@Param('kind') kind: string) {
    if (!KINDS.has(kind)) throw new NotFoundException();
    return this.catalog.listTaxonomy(kind);
  }

  @Post(':kind')
  @RequirePermissions('CATALOG_CREATE')
  create(
    @Param('kind') kind: string,
    @Body() body: CreateTaxonomyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    if (!KINDS.has(kind)) throw new NotFoundException();
    return this.catalog.createTaxonomy(kind, {
      ...body,
      actorId: admin.id,
      requestId: getRequestId(req),
    });
  }

  @Patch(':kind/:id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: UpdateTaxonomyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    if (!KINDS.has(kind)) throw new NotFoundException();
    const { expectedVersion, ...data } = body;
    return this.catalog.updateTaxonomy(
      kind,
      id,
      expectedVersion,
      data,
      admin.id,
      getRequestId(req),
    );
  }
}

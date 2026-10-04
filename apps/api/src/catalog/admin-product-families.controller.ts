import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators';
import { MediaService } from '../media/media.service';
import { ProductFamiliesService } from './product-families.service';

@ApiTags('admin-catalog')
@Controller('admin/catalog/product-families')
export class AdminProductFamiliesController {
  constructor(
    private readonly families: ProductFamiliesService,
    private readonly media: MediaService,
  ) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list() {
    return this.families.list();
  }

  @Get(':id')
  @RequirePermissions('CATALOG_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.families.getDto(id, (key) => this.media.getPublicUrl(key));
  }

  @Post()
  @RequirePermissions('CATALOG_UPDATE')
  create(@Body() body: { name: string }) {
    return this.families.create(body.name);
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name: string; expectedVersion: number },
  ) {
    return this.families.rename(id, body.name, body.expectedVersion);
  }

  @Put(':id/members/order')
  @RequirePermissions('CATALOG_UPDATE')
  reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { orderedProductIds: string[] },
  ) {
    return this.families.reorderMembers(id, body.orderedProductIds ?? []);
  }
}

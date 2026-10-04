import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators';
import { FlowerRefsService } from './flower-refs.service';

@ApiTags('admin-catalog')
@Controller('admin/catalog/flower-refs')
export class AdminFlowerRefsController {
  constructor(private readonly flowerRefs: FlowerRefsService) {}

  @Get('types')
  @RequirePermissions('CATALOG_READ')
  listTypes() {
    return this.flowerRefs.listTypes();
  }

  @Get('varieties')
  @RequirePermissions('CATALOG_READ')
  listVarieties(@Query('flowerTypeId') flowerTypeId?: string) {
    return this.flowerRefs.listVarieties(flowerTypeId);
  }

  @Get('origins')
  @RequirePermissions('CATALOG_READ')
  listOrigins() {
    return this.flowerRefs.listOrigins();
  }

  @Post('types')
  @RequirePermissions('CATALOG_UPDATE')
  createType(@Body() body: { name: string; slug?: string; sortOrder?: number }) {
    return this.flowerRefs.createType(body);
  }

  @Post('varieties')
  @RequirePermissions('CATALOG_UPDATE')
  createVariety(
    @Body() body: { flowerTypeId: string; name: string; slug?: string; sortOrder?: number },
  ) {
    return this.flowerRefs.createVariety(body);
  }

  @Post('origins')
  @RequirePermissions('CATALOG_UPDATE')
  createOrigin(@Body() body: { name: string; slug?: string; sortOrder?: number }) {
    return this.flowerRefs.createOrigin(body);
  }
}

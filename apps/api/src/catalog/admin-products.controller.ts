import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import {
  CreateProductDto,
  ExpectedVersionDto,
  ProductListQueryDto,
  PublishProductDto,
  ReorderProductMediaDto,
  SetProductBestsellerGroupsDto,
  SetProductComponentsDto,
  SetProductTaxonomiesDto,
  SetProductVariantsDto,
  UpdateProductDto,
  UpdateProductMediaDto,
  UploadProductMediaDto,
  UpsertProductPromotionDto,
} from './products.dto';
import { ProductsService } from './products.service';
import { PromotionsService } from './promotions.service';

@ApiTags('admin-catalog-products')
@Controller('admin/catalog/products')
export class AdminProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly promotions: PromotionsService,
  ) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list(@Query() query: ProductListQueryDto) {
    return this.products.list(query);
  }

  @Post()
  @RequirePermissions('CATALOG_CREATE')
  create(
    @Body() body: CreateProductDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.create(body, actorFrom(admin, req));
  }

  @Get(':id')
  @RequirePermissions('CATALOG_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.getById(id);
  }

  @Get(':id/preview')
  @RequirePermissions('CATALOG_READ')
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.preview(id);
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProductDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.update(id, body, actorFrom(admin, req));
  }

  @Put(':id/variants')
  @RequirePermissions('CATALOG_UPDATE')
  setVariants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetProductVariantsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.setVariants(id, body, actorFrom(admin, req));
  }

  @Put(':id/components')
  @RequirePermissions('CATALOG_UPDATE')
  setComponents(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetProductComponentsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.setComponents(id, body, actorFrom(admin, req));
  }

  @Put(':id/taxonomies')
  @RequirePermissions('CATALOG_UPDATE')
  setTaxonomies(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetProductTaxonomiesDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.setTaxonomies(id, body, actorFrom(admin, req));
  }

  @Put(':id/bestseller-groups')
  @RequirePermissions('CATALOG_UPDATE')
  setBestsellerGroups(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetProductBestsellerGroupsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.setBestsellerGroups(id, body, actorFrom(admin, req));
  }

  @Get(':id/promotion')
  @RequirePermissions('CATALOG_READ')
  getPromotion(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotions.getForProduct(id);
  }

  @Put(':id/promotion')
  @RequirePermissions('CATALOG_UPDATE')
  upsertPromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpsertProductPromotionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.promotions.upsertForProduct(id, body, actorFrom(admin, req));
  }

  @Delete(':id/promotion')
  @RequirePermissions('CATALOG_UPDATE')
  removePromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.promotions.removeForProduct(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Post(':id/publish')
  @RequirePermissions('CATALOG_PUBLISH')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PublishProductDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.publish(id, body, actorFrom(admin, req));
  }

  @Post(':id/unpublish')
  @RequirePermissions('CATALOG_PUBLISH')
  unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.unpublish(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Post(':id/archive')
  @RequirePermissions('CATALOG_PUBLISH')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.archive(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Post(':id/media')
  @RequirePermissions('CATALOG_UPDATE')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  addMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadProductMediaDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('File field "file" is required');
    }
    return this.products.addMedia(
      id,
      { buffer: file.buffer, originalname: file.originalname },
      body,
      actorFrom(admin, req),
    );
  }

  @Put(':id/media/order')
  @RequirePermissions('CATALOG_UPDATE')
  reorderMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReorderProductMediaDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.reorderMedia(id, body, actorFrom(admin, req));
  }

  @Patch(':id/media/:mediaId')
  @RequirePermissions('CATALOG_UPDATE')
  updateMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() body: UpdateProductMediaDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.updateMedia(id, mediaId, body, actorFrom(admin, req));
  }

  @Delete(':id/media/:mediaId')
  @RequirePermissions('CATALOG_UPDATE')
  removeMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.products.removeMedia(id, mediaId, actorFrom(admin, req));
  }
}

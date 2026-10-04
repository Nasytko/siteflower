import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Public } from '../auth/decorators';
import { PublicProductListQueryDto, RelatedProductsQueryDto } from './products.dto';
import { PublicCatalogService } from './public-catalog.service';

class PromotionalProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number = 24;
}

@ApiTags('catalog')
@Controller('catalog')
export class PublicCatalogController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Public()
  @Get('categories/tree')
  listCategoryTree() {
    return this.catalog.listCategoryTree();
  }

  @Public()
  @Get('categories/:slug')
  getCategory(@Param('slug') slug: string) {
    return this.catalog.getCategoryBySlug(slug);
  }

  @Public()
  @Get('flower-types')
  listFlowerTypes() {
    return this.catalog.listFlowerTypes();
  }

  @Public()
  @Get('flower-varieties')
  listFlowerVarieties(@Query('flowerTypeId') flowerTypeId?: string) {
    return this.catalog.listFlowerVarieties(flowerTypeId);
  }

  @Public()
  @Get('flower-origins')
  listFlowerOrigins() {
    return this.catalog.listFlowerOrigins();
  }

  @Public()
  @Get('products')
  listProducts(@Query() query: PublicProductListQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Public()
  @Get('products/:slug/related')
  listRelated(@Param('slug') slug: string, @Query() query: RelatedProductsQueryDto) {
    return this.catalog.listRelatedProducts(slug, query.limit ?? 8);
  }

  @Public()
  @Get('products/:slug')
  getProduct(@Param('slug') slug: string) {
    return this.catalog.getProductBySlug(slug);
  }

  @Public()
  @Get('occasions')
  listOccasions() {
    return this.catalog.listOccasions();
  }

  @Public()
  @Get('recipients')
  listRecipients() {
    return this.catalog.listRecipients();
  }

  @Public()
  @Get('flowers')
  listFlowers() {
    return this.catalog.listFlowers();
  }

  @Public()
  @Get('colors')
  listColors() {
    return this.catalog.listColors();
  }

  @Public()
  @Get('product-lines')
  listProductLines() {
    return this.catalog.listProductLines();
  }

  @Public()
  @Get('bouquet-sizes')
  listBouquetSizes() {
    return this.catalog.listBouquetSizes();
  }

  @Public()
  @Get('budget-ranges')
  listBudgetRanges() {
    return this.catalog.listBudgetRanges();
  }

  @Public()
  @Get('promotions')
  listPromotions(@Query() query: PromotionalProductsQueryDto) {
    return this.catalog.listPromotionalProducts(query.limit ?? 24);
  }

  @Public()
  @Get('bestsellers')
  listBestsellers() {
    return this.catalog.listBestsellers();
  }

  @Public()
  @Get('bestsellers/:slug')
  getBestsellerGroup(@Param('slug') slug: string) {
    return this.catalog.getBestsellerGroup(slug);
  }

  @Public()
  @Get('taxonomies/:kind/:slug')
  getTaxonomy(@Param('kind') kind: string, @Param('slug') slug: string) {
    return this.catalog.getTaxonomyPublic(kind, slug);
  }

  @Public()
  @Get('sitemap')
  getSitemap() {
    return this.catalog.getSitemap();
  }
}

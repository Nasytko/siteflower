import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { PublicProductListQueryDto, RelatedProductsQueryDto } from './products.dto';
import { PublicCatalogService } from './public-catalog.service';

@ApiTags('catalog')
@Controller('catalog')
export class PublicCatalogController {
  constructor(private readonly catalog: PublicCatalogService) {}

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
  @Get('categories')
  listCategories() {
    return this.catalog.listCategories();
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
  @Get('styles')
  listStyles() {
    return this.catalog.listStyles();
  }

  @Public()
  @Get('colors')
  listColors() {
    return this.catalog.listColors();
  }

  @Public()
  @Get('taxonomies/:kind/:slug')
  getTaxonomy(@Param('kind') kind: string, @Param('slug') slug: string) {
    return this.catalog.getTaxonomyPublic(kind, slug);
  }

  @Public()
  @Get('collections')
  listCollections() {
    return this.catalog.listCollections();
  }

  @Public()
  @Get('collections/:slug')
  getCollection(@Param('slug') slug: string) {
    return this.catalog.getCollectionBySlug(slug);
  }

  @Public()
  @Get('sitemap')
  getSitemap() {
    return this.catalog.getSitemap();
  }
}

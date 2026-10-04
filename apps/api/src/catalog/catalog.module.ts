import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AppConfigModule } from '../config/app-config.module';
import { DatabaseModule } from '../database/database.module';
import { MediaModule } from '../media/media.module';
import { AdminBestsellersController } from './admin-bestsellers.controller';
import { AdminBudgetRangesController } from './admin-budget-ranges.controller';
import { AdminCatalogCategoriesController } from './admin-catalog-categories.controller';
import { AdminFlowerRefsController } from './admin-flower-refs.controller';
import { AdminProductFamiliesController } from './admin-product-families.controller';
import { AdminProductsController } from './admin-products.controller';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminSeoController } from './admin-seo.controller';
import { BestsellersService } from './bestsellers.service';
import { BudgetRangesService } from './budget-ranges.service';
import { CatalogCategoriesService } from './catalog-categories.service';
import { FlowerRefsService } from './flower-refs.service';
import { ProductFamiliesService } from './product-families.service';
import { ProductsRepository } from './products.repository';
import { ProductsBulkService } from './products-bulk.service';
import { ProductsService } from './products.service';
import { PromotionsService } from './promotions.service';
import { PublicCatalogController } from './public-catalog.controller';
import { PublicCatalogService } from './public-catalog.service';
import { SeoHealthService } from './seo-health.service';
import { SlugRedirectsService } from './slug-redirects.service';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

/**
 * Controller order matters: `TaxonomyController` serves `admin/catalog/:kind`,
 * so every concrete admin path must be registered before it.
 */
@Module({
  imports: [AppConfigModule, DatabaseModule, AuditModule, MediaModule],
  controllers: [
    AdminProductsController,
    AdminPromotionsController,
    AdminBestsellersController,
    AdminBudgetRangesController,
    AdminCatalogCategoriesController,
    AdminFlowerRefsController,
    AdminProductFamiliesController,
    AdminSeoController,
    TaxonomyController,
    PublicCatalogController,
  ],
  providers: [
    ProductsRepository,
    ProductsService,
    ProductsBulkService,
    TaxonomyService,
    BestsellersService,
    BudgetRangesService,
    CatalogCategoriesService,
    FlowerRefsService,
    ProductFamiliesService,
    PromotionsService,
    PublicCatalogService,
    SlugRedirectsService,
    SeoHealthService,
  ],
  exports: [ProductsService, ProductsRepository, PromotionsService, BestsellersService],
})
export class CatalogModule {}

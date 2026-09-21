import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AppConfigModule } from '../config/app-config.module';
import { DatabaseModule } from '../database/database.module';
import { MediaModule } from '../media/media.module';
import { AdminProductsController } from './admin-products.controller';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { PublicCatalogController } from './public-catalog.controller';
import { PublicCatalogService } from './public-catalog.service';
import { SlugRedirectsService } from './slug-redirects.service';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

/**
 * Controller order matters: `TaxonomyController` serves `admin/catalog/:kind`,
 * so the concrete product and collection paths must be registered first.
 */
@Module({
  imports: [AppConfigModule, DatabaseModule, AuditModule, MediaModule],
  controllers: [
    AdminProductsController,
    CollectionsController,
    TaxonomyController,
    PublicCatalogController,
  ],
  providers: [
    ProductsRepository,
    ProductsService,
    TaxonomyService,
    CollectionsService,
    PublicCatalogService,
    SlugRedirectsService,
  ],
  exports: [ProductsService, CollectionsService, ProductsRepository],
})
export class CatalogModule {}

import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminStorefrontController } from './admin-storefront.controller';
import { HomepageConfigService } from './homepage-config.service';
import { PublicStorefrontController } from './public-storefront.controller';
import { StorefrontSettingsService } from './storefront-settings.service';

@Module({
  imports: [AuditModule],
  controllers: [AdminStorefrontController, PublicStorefrontController],
  providers: [StorefrontSettingsService, HomepageConfigService],
  exports: [StorefrontSettingsService, HomepageConfigService],
})
export class StorefrontModule {}

import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminInstagramController } from './admin-instagram.controller';
import { AdminStorefrontController } from './admin-storefront.controller';
import { HomepageConfigService } from './homepage-config.service';
import { InstagramService } from './instagram.service';
import { PublicStorefrontController } from './public-storefront.controller';
import { StorefrontSettingsService } from './storefront-settings.service';

@Module({
  imports: [AuditModule],
  controllers: [AdminStorefrontController, AdminInstagramController, PublicStorefrontController],
  providers: [StorefrontSettingsService, HomepageConfigService, InstagramService],
  exports: [StorefrontSettingsService, HomepageConfigService, InstagramService],
})
export class StorefrontModule {}

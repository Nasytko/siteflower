import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { AdminInstagramController } from './admin-instagram.controller';
import { AdminNavigationController } from './admin-navigation.controller';
import { AdminStorefrontController } from './admin-storefront.controller';
import { HomepageConfigService } from './homepage-config.service';
import { InstagramService } from './instagram.service';
import { NavigationMenuService } from './navigation-menu.service';
import { PublicStorefrontController } from './public-storefront.controller';
import { StorefrontSettingsService } from './storefront-settings.service';

@Module({
  imports: [AuditModule, MediaModule],
  controllers: [
    AdminStorefrontController,
    AdminNavigationController,
    AdminInstagramController,
    PublicStorefrontController,
  ],
  providers: [
    StorefrontSettingsService,
    HomepageConfigService,
    InstagramService,
    NavigationMenuService,
  ],
  exports: [
    StorefrontSettingsService,
    HomepageConfigService,
    InstagramService,
    NavigationMenuService,
  ],
})
export class StorefrontModule {}

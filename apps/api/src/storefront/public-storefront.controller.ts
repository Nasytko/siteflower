import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { HomepageConfigService } from './homepage-config.service';
import { InstagramService } from './instagram.service';
import { StorefrontSettingsService } from './storefront-settings.service';

@ApiTags('storefront')
@Controller('storefront')
export class PublicStorefrontController {
  constructor(
    private readonly settings: StorefrontSettingsService,
    private readonly homepage: HomepageConfigService,
    private readonly instagram: InstagramService,
  ) {}

  @Public()
  @Get('settings')
  getSettings() {
    return this.settings.getPublic();
  }

  @Public()
  @Get('homepage')
  getHomepage() {
    return this.homepage.getPublic();
  }

  @Public()
  @Get('instagram')
  getInstagram() {
    return this.instagram.getPublicFeed();
  }
}

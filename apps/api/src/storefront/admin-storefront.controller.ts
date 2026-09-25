import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { HomepageConfigService } from './homepage-config.service';
import { actorFrom } from '../common/actor.util';
import { UpdateHomepageConfigDto, UpdateStorefrontSettingsDto } from './storefront.dto';
import { StorefrontSettingsService } from './storefront-settings.service';

@ApiTags('admin-storefront')
@Controller('admin/storefront')
export class AdminStorefrontController {
  constructor(
    private readonly settings: StorefrontSettingsService,
    private readonly homepage: HomepageConfigService,
  ) {}

  @Get('settings')
  @RequirePermissions('SETTINGS_READ')
  getSettings() {
    return this.settings.getAdmin();
  }

  @Patch('settings')
  @RequirePermissions('SETTINGS_UPDATE')
  updateSettings(
    @Body() body: UpdateStorefrontSettingsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.settings.update(body, actorFrom(admin, req));
  }

  @Get('homepage')
  @RequirePermissions('CONTENT_READ')
  getHomepage() {
    return this.homepage.getAdmin();
  }

  @Patch('homepage')
  @RequirePermissions('CONTENT_UPDATE')
  updateHomepage(
    @Body() body: UpdateHomepageConfigDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.homepage.update(body, actorFrom(admin, req));
  }
}

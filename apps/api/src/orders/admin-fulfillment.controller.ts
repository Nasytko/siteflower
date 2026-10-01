import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { getRequestId } from '../common/middleware/request-id.middleware';
import { UpdateFulfillmentSettingsBodyDto } from './fulfillment-settings.dto';
import { FulfillmentSettingsService } from './fulfillment-settings.service';

@ApiTags('admin-fulfillment')
@Controller('admin/fulfillment')
export class AdminFulfillmentController {
  constructor(private readonly fulfillment: FulfillmentSettingsService) {}

  @RequirePermissions('SETTINGS_READ')
  @Get('settings')
  get() {
    return this.fulfillment.getAdmin();
  }

  @RequirePermissions('SETTINGS_UPDATE')
  @Patch('settings')
  update(
    @Body() body: UpdateFulfillmentSettingsBodyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.fulfillment.update(body, {
      id: admin.id,
      requestId: getRequestId(req),
    });
  }
}

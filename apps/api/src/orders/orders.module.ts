import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AppConfigModule } from '../config/app-config.module';
import { MediaModule } from '../media/media.module';
import { AdminFulfillmentController } from './admin-fulfillment.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { FulfillmentSettingsService } from './fulfillment-settings.service';
import { OrdersService } from './orders.service';
import { PublicCheckoutController } from './public-checkout.controller';

@Module({
  imports: [AppConfigModule, AuditModule, CatalogModule, MediaModule],
  controllers: [PublicCheckoutController, AdminOrdersController, AdminFulfillmentController],
  providers: [OrdersService, FulfillmentSettingsService],
  exports: [OrdersService, FulfillmentSettingsService],
})
export class OrdersModule {}

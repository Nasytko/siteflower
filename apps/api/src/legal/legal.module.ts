import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { ComplianceService } from './compliance.service';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalEntityService } from './legal-entity.service';

/**
 * Legal HTTP admin/public APIs removed — storefront texts live in web templates.
 * Services remain available for optional CLI / internal use.
 */
@Module({
  imports: [AuditModule, StorefrontModule, OrdersModule],
  controllers: [],
  providers: [LegalEntityService, LegalDocumentsService, ComplianceService],
  exports: [LegalEntityService, LegalDocumentsService, ComplianceService],
})
export class LegalModule {}

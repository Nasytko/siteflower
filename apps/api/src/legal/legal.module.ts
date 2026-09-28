import { Module, OnModuleInit } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { AdminLegalController } from './admin-legal.controller';
import { ComplianceService } from './compliance.service';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalEntityService } from './legal-entity.service';
import { PublicLegalController } from './public-legal.controller';

@Module({
  imports: [AuditModule, StorefrontModule, OrdersModule],
  controllers: [AdminLegalController, PublicLegalController],
  providers: [LegalEntityService, LegalDocumentsService, ComplianceService],
  exports: [LegalEntityService, LegalDocumentsService, ComplianceService],
})
export class LegalModule implements OnModuleInit {
  constructor(
    private readonly entity: LegalEntityService,
    private readonly documents: LegalDocumentsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.entity.getAdmin();
    await this.documents.ensureDocuments();
  }
}

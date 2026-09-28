import { Injectable } from '@nestjs/common';
import {
  buildComplianceStatus,
  type ComplianceStatusDto,
} from '@bouquet-one/contracts';
import { FulfillmentSettingsService } from '../orders/fulfillment-settings.service';
import { StorefrontSettingsService } from '../storefront/storefront-settings.service';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalEntityService } from './legal-entity.service';

@Injectable()
export class ComplianceService {
  constructor(
    private readonly entity: LegalEntityService,
    private readonly documents: LegalDocumentsService,
    private readonly storefront: StorefrontSettingsService,
    private readonly fulfillment: FulfillmentSettingsService,
  ) {}

  async getStatus(): Promise<ComplianceStatusDto> {
    const [entity, storefront, fulfillment, documents] = await Promise.all([
      this.entity.getAdmin(),
      this.storefront.getPublic(),
      this.fulfillment.getPublic(),
      this.documents.documentPublishStates(),
    ]);

    return buildComplianceStatus({
      entity,
      storefrontPhone: storefront.phone,
      storefrontEmail: storefront.email,
      storefrontHours: storefront.workingHours,
      pickupEnabled: fulfillment.pickupEnabled,
      documents,
    });
  }
}

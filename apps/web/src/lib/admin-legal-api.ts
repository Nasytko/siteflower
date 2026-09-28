/**
 * Server-side Admin legal / compliance reads.
 * Client mutations: `@/lib/admin-legal-client`. Kind paths: `@/lib/admin-endpoints`.
 */

import type {
  ComplianceStatusDto,
  LegalDocumentAdminDto,
  LegalEntitySettingsDto,
} from '@bouquet-one/contracts';
import { adminFetch } from './admin-api';
import { adminEndpoints } from './admin-endpoints';

export function fetchLegalEntity(): Promise<LegalEntitySettingsDto> {
  return adminFetch<LegalEntitySettingsDto>(adminEndpoints.legalEntity);
}

export function fetchLegalCompliance(): Promise<ComplianceStatusDto> {
  return adminFetch<ComplianceStatusDto>(adminEndpoints.legalCompliance);
}

export function fetchLegalDocuments(): Promise<LegalDocumentAdminDto[]> {
  return adminFetch<LegalDocumentAdminDto[]>(adminEndpoints.legalDocuments);
}

export function fetchLegalDocument(kindPath: string): Promise<LegalDocumentAdminDto> {
  return adminFetch<LegalDocumentAdminDto>(adminEndpoints.legalDocument(kindPath));
}

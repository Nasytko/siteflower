/**
 * Browser-side Admin legal mutations (cookie session). Safe for 'use client'.
 */

import type {
  ComplianceStatusDto,
  LegalDocumentAdminDto,
  LegalEntitySettingsDto,
  UpdateLegalEntitySettingsDto,
} from '@bouquet-one/contracts';
import { adminGet, adminPatch, adminPost, adminPut } from './admin-client';
import { adminEndpoints } from './admin-endpoints';

export const legalClientApi = {
  getEntity: () => adminGet<LegalEntitySettingsDto>(adminEndpoints.legalEntity),
  patchEntity: (body: UpdateLegalEntitySettingsDto) =>
    adminPatch<LegalEntitySettingsDto>(adminEndpoints.legalEntity, body),
  getCompliance: () => adminGet<ComplianceStatusDto>(adminEndpoints.legalCompliance),
  listDocuments: () => adminGet<LegalDocumentAdminDto[]>(adminEndpoints.legalDocuments),
  getDocument: (kindPath: string) =>
    adminGet<LegalDocumentAdminDto>(adminEndpoints.legalDocument(kindPath)),
  putDraft: (kindPath: string, body: { title: string; bodyMarkdown: string }) =>
    adminPut<LegalDocumentAdminDto>(adminEndpoints.legalDocumentDraft(kindPath), body),
  publish: (kindPath: string, body: { effectiveAt?: string | null } = {}) =>
    adminPost<LegalDocumentAdminDto>(adminEndpoints.legalDocumentPublish(kindPath), body),
};

import {
  LEGAL_DOCUMENT_KIND_LABELS,
  roleHasPermission,
} from '@bouquet-one/contracts';
import { LegalCompliancePanel } from '@/components/admin/legal-compliance-panel';
import { LegalEntityEditor } from '@/components/admin/legal-entity-editor';
import {
  fetchLegalCompliance,
  fetchLegalDocuments,
  fetchLegalEntity,
} from '@/lib/admin-legal-api';
import { legalDocumentKindPath } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminLegalPage() {
  const me = await requireAdminPermission('LEGAL_READ');
  const [entity, compliance, documents] = await Promise.all([
    fetchLegalEntity(),
    fetchLegalCompliance(),
    fetchLegalDocuments(),
  ]);

  const documentLinks = documents.map((doc) => ({
    kind: doc.kind,
    title: LEGAL_DOCUMENT_KIND_LABELS[doc.kind],
    href: `/admin/legal/documents/${legalDocumentKindPath(doc.kind)}`,
  }));

  return (
    <main id="main-content" className="space-y-8">
      <header>
        <h1 className="admin-page-title">Юридическая информация</h1>
        <p className="admin-page-lead">
          Данные продавца, реестры и публичные документы для запуска интернет-магазина в Беларуси.
        </p>
      </header>

      <LegalCompliancePanel compliance={compliance} documents={documentLinks} />

      <section className="admin-section">
        <h2 className="admin-section__title">Данные продавца</h2>
        <p className="admin-section__lead">
          Пустые обязательные поля — намеренно. Не подставляйте вымышленные номера регистрации или
          торгового реестра.
        </p>
        <LegalEntityEditor
          initial={entity}
          canPublish={roleHasPermission(me.user.role, 'LEGAL_PUBLISH')}
        />
      </section>
    </main>
  );
}

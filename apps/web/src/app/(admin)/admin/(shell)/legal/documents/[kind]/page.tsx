import { notFound } from 'next/navigation';
import { roleHasPermission } from '@bouquet-one/contracts';
import { LegalDocumentEditor } from '@/components/admin/legal-document-editor';
import { parseLegalDocumentKindPath } from '@/lib/admin-endpoints';
import { fetchLegalDocument } from '@/lib/admin-legal-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';

type Props = { params: Promise<{ kind: string }> };

export default async function AdminLegalDocumentPage({ params }: Props) {
  const { kind: rawKind } = await params;
  const kind = parseLegalDocumentKindPath(rawKind);
  if (!kind) {
    notFound();
  }

  const me = await requireAdminPermission('LEGAL_READ');
  const document = await fetchLegalDocument(rawKind.toLowerCase().replace(/-/g, '_'));

  return (
    <main id="main-content">
      <LegalDocumentEditor
        initial={document}
        kind={kind}
        canEdit={roleHasPermission(me.user.role, 'LEGAL_EDIT')}
        canPublish={roleHasPermission(me.user.role, 'LEGAL_PUBLISH')}
      />
    </main>
  );
}

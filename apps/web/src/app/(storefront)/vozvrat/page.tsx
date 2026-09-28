import type { Metadata } from 'next';
import {
  LegalDocumentMissing,
  LegalDocumentView,
} from '@/components/storefront/legal-document-view';
import { getLegalDocument, PublicApiError } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Возврат и отмена',
  description: 'Условия возврата, отмены заказа и претензий в интернет-магазине BUKET №1.',
  path: '/vozvrat',
});

export default async function ReturnsPolicyPage() {
  const document = await getLegalDocument('returns_policy').catch((error: unknown) => {
    if (error instanceof PublicApiError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    return null;
  });

  return (
    <main id="main-content" className="sf-legal-page">
      <div className="sf-legal-page__glow" aria-hidden="true" />
      <div className="sf-container py-14 md:py-20">
        {document ? (
          <LegalDocumentView document={document} />
        ) : (
          <LegalDocumentMissing title="Возврат, отмена и претензии" />
        )}
      </div>
    </main>
  );
}

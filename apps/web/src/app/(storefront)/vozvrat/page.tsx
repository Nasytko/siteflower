import type { Metadata } from 'next';
import {
  LegalDocumentView,
  LegalPageShell,
  LegalRelatedNav,
} from '@/components/storefront/legal-document-view';
import { getFixedLegalDocument } from '@/lib/legal-content';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Возврат и отмена',
  description: 'Условия возврата, отмены заказа и претензий в интернет-магазине BUKET №1.',
  path: '/vozvrat',
});

export default function ReturnsPolicyPage() {
  const document = getFixedLegalDocument('returns_policy');

  return (
    <LegalPageShell>
      <LegalDocumentView document={document} />
      <LegalRelatedNav
        links={[
          { href: '/oferta', label: 'Условия заказа' },
          { href: '/privacy', label: 'Персональные данные' },
          { href: '/kontakty', label: 'Контакты' },
        ]}
      />
    </LegalPageShell>
  );
}

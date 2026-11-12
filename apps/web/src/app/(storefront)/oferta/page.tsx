import type { Metadata } from 'next';
import {
  LegalDocumentView,
  LegalPageShell,
  LegalRelatedNav,
} from '@/components/storefront/legal-document-view';
import { getFixedLegalDocument } from '@/lib/legal-content';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Договор публичной оферты',
  description:
    'Договор публичной оферты интернет-магазина BUKET №1 о дистанционной продаже цветов, букетов и сопутствующих товаров.',
  path: '/oferta',
});

export default function OrderTermsPage() {
  const document = getFixedLegalDocument('order_terms');

  return (
    <LegalPageShell>
      <LegalDocumentView document={document} />
      <LegalRelatedNav
        links={[
          { href: '/vozvrat', label: 'Возврат и отмена' },
          { href: '/privacy', label: 'Персональные данные' },
          { href: '/dostavka', label: 'Доставка и оплата' },
          { href: '/kontakty', label: 'Контакты' },
        ]}
      />
    </LegalPageShell>
  );
}

import type { Metadata } from 'next';
import {
  LegalDocumentMissing,
  LegalDocumentView,
} from '@/components/storefront/legal-document-view';
import { getLegalDocument, PublicApiError } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Политика конфиденциальности',
  description:
    'Политика обработки персональных данных и сведения о cookies / локальном хранении в BUKET №1.',
  path: '/privacy',
});

function CookiesAppendix() {
  return (
    <section aria-labelledby="cookies-heading">
      <h2 id="cookies-heading" className="sf-legal-h2">
        Cookies и локальное хранение
      </h2>
      <p className="sf-legal-p">
        Сайт использует ограниченный набор технических механизмов хранения на устройстве
        посетителя:
      </p>
      <ul className="sf-legal-list">
        <li>
          <strong>localStorage</strong> — корзина, избранное и недавние поисковые запросы на
          витрине (без передачи этих данных на сервер до оформления заказа).
        </li>
        <li>
          <strong>sessionStorage</strong> — служебные данные сессии оформления заказа
          (идемпотентность, черновик checkout, краткая ссылка на страницу успешного заказа).
        </li>
        <li>
          <strong>Cookie администратора</strong> — сессионная cookie входа в панель управления
          (только для сотрудников, не для покупателей витрины).
        </li>
      </ul>
      <p className="sf-legal-p">
        Рекламные и аналитические cookies третьих сторон на витрине по умолчанию не используются.
      </p>
    </section>
  );
}

export default async function PrivacyPolicyPage() {
  const document = await getLegalDocument('privacy_policy').catch((error: unknown) => {
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
          <LegalDocumentView document={document} appendix={<CookiesAppendix />} />
        ) : (
          <div className="sf-legal-doc">
            <LegalDocumentMissing title="Политика обработки персональных данных" />
            <div className="sf-legal-appendix mt-12">
              <CookiesAppendix />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

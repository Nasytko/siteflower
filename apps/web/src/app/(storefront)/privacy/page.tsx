import type { Metadata } from 'next';
import {
  LegalDocumentView,
  LegalPageShell,
  LegalRelatedNav,
} from '@/components/storefront/legal-document-view';
import { getFixedLegalDocument } from '@/lib/legal-content';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Политика обработки персональных данных',
  description:
    'Какие данные BUKET №1 получает при заявке, как использует их для заказа и доставки и как реализовать свои права.',
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

export default function PrivacyPolicyPage() {
  const document = getFixedLegalDocument('privacy_policy');

  return (
    <LegalPageShell>
      <LegalDocumentView document={document} appendix={<CookiesAppendix />} />
      <LegalRelatedNav
        links={[
          { href: '/oferta', label: 'Договор публичной оферты' },
          { href: '/vozvrat', label: 'Возврат и отмена' },
          { href: '/kontakty', label: 'Контакты' },
        ]}
      />
    </LegalPageShell>
  );
}

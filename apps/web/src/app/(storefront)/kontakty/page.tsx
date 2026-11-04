import type { Metadata } from 'next';
import { LegalPageShell, LegalRelatedNav } from '@/components/storefront/legal-document-view';
import { getFixedLegalBank, getFixedLegalSeller } from '@/lib/legal-content';
import { getStorefrontSettings } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Контакты и реквизиты',
  description: 'Контакты интернет-магазина BUKET №1, реквизиты продавца и обращения покупателей.',
  path: '/kontakty',
});

export default async function ContactsPage() {
  const settings = await getStorefrontSettings().catch(() => null);
  const seller = getFixedLegalSeller(settings);
  const bank = getFixedLegalBank();

  const brandName = seller.brandName;
  const city = seller.city;
  const phone = seller.phone;
  const email = seller.email;
  const hours = seller.businessHours;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : null;
  const claimsPhone = seller.consumerClaimsPhone ?? phone;
  const claimsEmail = seller.consumerClaimsEmail ?? email;

  return (
    <LegalPageShell>
      <header className="sf-legal-page-intro">
        <p className="sf-label">{city}</p>
        <h1 className="sf-display">Контакты и реквизиты</h1>
        <p className="sf-body mt-4 text-muted">
          Интернет-магазин <span className="text-foreground">{brandName}</span>
          {city ? ` · ${city}` : null}
        </p>
      </header>

      <div className="sf-legal-grid">
        <section className="sf-legal-block" aria-labelledby="seller-heading">
          <h2 id="seller-heading" className="sf-h3">
            Продавец
          </h2>
          <dl className="sf-legal-dl mt-5">
            <div>
              <dt>Наименование</dt>
              <dd>{seller.legalName}</dd>
            </div>
            <div>
              <dt>УНП</dt>
              <dd>{seller.unp}</dd>
            </div>
            <div>
              <dt>Юридический адрес</dt>
              <dd>{seller.legalAddress}</dd>
            </div>
          </dl>
        </section>

        {(phone || email || hours) && (
          <section className="sf-legal-block" aria-labelledby="contact-heading">
            <h2 id="contact-heading" className="sf-h3">
              Связь
            </h2>
            <dl className="sf-legal-dl mt-5">
              {phone ? (
                <div>
                  <dt>Телефон</dt>
                  <dd>
                    <a href={telHref!}>{phone}</a>
                  </dd>
                </div>
              ) : null}
              {email ? (
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${email}`}>{email}</a>
                  </dd>
                </div>
              ) : null}
              {hours ? (
                <div>
                  <dt>Часы работы</dt>
                  <dd className="whitespace-pre-line">{hours}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        )}

        <section className="sf-legal-block" aria-labelledby="claims-heading">
          <h2 id="claims-heading" className="sf-h3">
            Обращения потребителей
          </h2>
          <p className="sf-small mt-3 text-muted">
            По вопросам качества, претензий и возврата — по контактам ниже.
          </p>
          <dl className="sf-legal-dl mt-5">
            {claimsPhone ? (
              <div>
                <dt>Телефон</dt>
                <dd>
                  <a href={`tel:${claimsPhone.replace(/\s+/g, '')}`}>{claimsPhone}</a>
                </dd>
              </div>
            ) : null}
            {claimsEmail ? (
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${claimsEmail}`}>{claimsEmail}</a>
                </dd>
              </div>
            ) : null}
            {!claimsPhone && !claimsEmail ? (
              <div>
                <dd className="text-muted">
                  Контакты для обращений берутся из настроек витрины (телефон / email).
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      <details className="sf-legal-details mt-8">
        <summary>Банковские реквизиты</summary>
        <dl className="sf-legal-dl mt-5">
          <div>
            <dt>Получатель</dt>
            <dd>{bank.legalName}</dd>
          </div>
          <div>
            <dt>УНП</dt>
            <dd>{bank.unp}</dd>
          </div>
          {bank.bankAccountIban ? (
            <div>
              <dt>IBAN</dt>
              <dd className="font-mono text-sm tracking-wide">{bank.bankAccountIban}</dd>
            </div>
          ) : null}
          {bank.bankName ? (
            <div>
              <dt>Банк</dt>
              <dd>{bank.bankName}</dd>
            </div>
          ) : null}
          {bank.bankAddress ? (
            <div>
              <dt>Адрес банка</dt>
              <dd>{bank.bankAddress}</dd>
            </div>
          ) : null}
          {bank.bankSwift ? (
            <div>
              <dt>SWIFT</dt>
              <dd className="font-mono text-sm">{bank.bankSwift}</dd>
            </div>
          ) : null}
          {bank.bankUnp ? (
            <div>
              <dt>УНП банка</dt>
              <dd>{bank.bankUnp}</dd>
            </div>
          ) : null}
        </dl>
      </details>

      <LegalRelatedNav
        links={[
          { href: '/dostavka', label: 'Доставка и оплата' },
          { href: '/oferta', label: 'Условия заказа' },
          { href: '/vozvrat', label: 'Возврат и отмена' },
          { href: '/privacy', label: 'Персональные данные' },
        ]}
      />
    </LegalPageShell>
  );
}

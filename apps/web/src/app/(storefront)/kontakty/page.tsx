import type { Metadata } from 'next';
import Link from 'next/link';
import { getLegalBank, getLegalSeller, getStorefrontSettings } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Контакты и реквизиты',
  description: 'Контакты интернет-магазина BUKET №1, реквизиты продавца и обращения покупателей.',
  path: '/kontakty',
});

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-BY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function ContactsPage() {
  const [settings, seller, bank] = await Promise.all([
    getStorefrontSettings().catch(() => null),
    getLegalSeller().catch(() => null),
    getLegalBank().catch(() => null),
  ]);

  const brandName = seller?.brandName ?? settings?.brandName ?? 'BUKET №1';
  const city = seller?.city ?? settings?.city ?? 'Гродно';
  const phone = seller?.phone ?? null;
  const email = seller?.email ?? null;
  const hours = seller?.businessHours ?? null;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : null;

  const claimsPhone = seller?.consumerClaimsPhone ?? phone;
  const claimsEmail = seller?.consumerClaimsEmail ?? email;
  const claimsName = seller?.consumerClaimsContactName ?? null;

  const hasTradeRegister = Boolean(
    seller?.tradeRegisterNumber?.trim() && seller?.tradeRegisterDate,
  );
  const hasBank = Boolean(
    bank?.bankAccountIban?.trim() ||
      bank?.bankName?.trim() ||
      bank?.bankSwift?.trim() ||
      bank?.bankUnp?.trim(),
  );

  return (
    <main id="main-content" className="sf-legal-page">
      <div className="sf-legal-page__glow" aria-hidden="true" />
      <div className="sf-container py-14 md:py-20">
        <header className="max-w-2xl">
          <p className="sf-label mb-3">{city}</p>
          <h1 className="sf-display">Контакты и реквизиты</h1>
          <p className="sf-body mt-5 text-muted">
            Интернет-магазин <span className="text-foreground">{brandName}</span>
            {city ? ` · ${city}` : null}
          </p>
        </header>

        <div className="sf-legal-grid mt-14">
          <section className="sf-legal-block" aria-labelledby="seller-heading">
            <h2 id="seller-heading" className="sf-h3">
              Продавец
            </h2>
            {seller ? (
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
                {seller.stateRegistrationDate || seller.registeringAuthority ? (
                  <div>
                    <dt>Государственная регистрация</dt>
                    <dd>
                      {[
                        seller.stateRegistrationNumber
                          ? `№ ${seller.stateRegistrationNumber}`
                          : null,
                        formatDate(seller.stateRegistrationDate),
                        seller.registeringAuthority,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="sf-body mt-4 text-muted">Реквизиты временно недоступны.</p>
            )}
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
              По вопросам качества, претензий и возврата можно обратиться по контактам ниже.
            </p>
            <dl className="sf-legal-dl mt-5">
              {claimsName ? (
                <div>
                  <dt>Контактное лицо</dt>
                  <dd>{claimsName}</dd>
                </div>
              ) : null}
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
              {!claimsName && !claimsPhone && !claimsEmail ? (
                <div>
                  <dd className="text-muted">Контакты для обращений уточняются.</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {hasTradeRegister && seller ? (
            <section className="sf-legal-block" aria-labelledby="trade-heading">
              <h2 id="trade-heading" className="sf-h3">
                Торговый реестр
              </h2>
              <dl className="sf-legal-dl mt-5">
                <div>
                  <dt>Номер</dt>
                  <dd>{seller.tradeRegisterNumber}</dd>
                </div>
                {seller.tradeRegisterDate ? (
                  <div>
                    <dt>Дата включения</dt>
                    <dd>{formatDate(seller.tradeRegisterDate)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
        </div>

        {hasBank && bank ? (
          <details className="sf-legal-details mt-12 max-w-2xl">
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
        ) : null}

        <nav className="mt-14 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Связанные страницы">
          <Link href="/dostavka" className="font-medium text-brand hover:underline">
            Доставка и оплата
          </Link>
          <Link href="/oferta" className="font-medium text-brand hover:underline">
            Условия заказа
          </Link>
          <Link href="/o-nas" className="font-medium text-brand hover:underline">
            О нас
          </Link>
        </nav>
      </div>
    </main>
  );
}

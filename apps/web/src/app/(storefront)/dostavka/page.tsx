import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageShell, LegalRelatedNav } from '@/components/storefront/legal-document-view';
import { SafeMarkdown } from '@/components/storefront/safe-markdown';
import {
  FIXED_SELLER,
  getFixedLegalDocument,
  getFixedLegalSeller,
} from '@/lib/legal-content';
import { isManagerTimeWindowId } from '@bouquet-one/contracts';
import { formatDeliveryFeeLabel } from '@/lib/delivery-fee-label';
import { getFulfillmentOptions, getStorefrontSettings } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Доставка цветов по Гродно и области',
  description:
    'Бесплатная доставка букетов в черте Гродно. Условия и сроки доставки за город уточняйте у магазина до заказа.',
  path: '/dostavka',
});

function formatLeadTime(minutes: number): string | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `от ${minutes} мин`;
  const hours = Math.round(minutes / 60);
  return `от ${hours} ч`;
}

export default async function DeliveryPage() {
  const [settings, fulfillment] = await Promise.all([
    getStorefrontSettings().catch(() => null),
    getFulfillmentOptions().catch(() => null),
  ]);

  const seller = getFixedLegalSeller(settings);
  const deliveryDoc = getFixedLegalDocument('delivery_payment');
  const city = seller.city;
  const summary = settings?.deliverySummary?.trim() || null;
  const outOfCityNote =
    settings?.outOfCityDeliveryNote?.trim() ||
    'Доставка за пределы Гродно — по согласованию с менеджером. Тарифы, сроки и населённые пункты уточняйте у магазина до заказа.';
  const pickupAddress = seller.pickupAddress?.trim() || null;
  const offlinePayment = FIXED_SELLER.actualOfflinePaymentDescription;
  const windows =
    fulfillment?.timeWindows
      .filter((w) => w.active !== false && !isManagerTimeWindowId(w.id))
      .sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  const cityFeeLabel = fulfillment
    ? formatDeliveryFeeLabel(fulfillment.deliveryFeeMinor, fulfillment.currency)
    : 'Бесплатно';
  const cityLead = fulfillment ? formatLeadTime(fulfillment.minLeadTimeMinutes) : null;

  return (
    <LegalPageShell>
      <header className="sf-legal-page-intro">
        <p className="sf-label">{city}</p>
        <h1 className="sf-display">Доставка и оплата</h1>
        {summary ? (
          <p className="sf-body mt-4 whitespace-pre-line text-muted">{summary}</p>
        ) : (
          <p className="sf-body mt-4 text-muted">
            Бесплатная доставка в черте Гродно. После оформления заказа менеджер подтвердит детали
            доставки или самовывоза.
          </p>
        )}
      </header>

      <div className="sf-legal-grid">
        <section className="sf-legal-block" aria-labelledby="city-delivery-heading">
          <h2 id="city-delivery-heading" className="sf-h3">
            В черте Гродно
          </h2>
          {!fulfillment ? (
            <p className="sf-body mt-4 text-muted">
              Актуальные условия уточняйте у менеджера после оформления заказа.
            </p>
          ) : fulfillment.deliveryEnabled ? (
            <dl className="sf-legal-dl mt-5">
              <div>
                <dt>Курьерская доставка</dt>
                <dd>
                  {[cityFeeLabel, cityLead, `по ${city}`].filter(Boolean).join(' · ')}
                </dd>
              </div>
              {fulfillment.maxAdvanceDays > 0 ? (
                <div>
                  <dt>Предзаказ</dt>
                  <dd>До {fulfillment.maxAdvanceDays} дн. вперёд</dd>
                </div>
              ) : null}
              {windows.length > 0 ? (
                <div>
                  <dt>Интервалы доставки</dt>
                  <dd>
                    <p className="mb-2">
                      Каждый час с 9:00 до 21:00. Ближайший слот — не раньше чем через час от
                      момента заказа. Вне рабочих часов можно согласовать время с менеджером при
                      оформлении.
                    </p>
                    <ul className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                      {windows.map((window) => (
                        <li key={window.id ?? `${window.label}-${window.startMinutes}`}>
                          {window.label}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="sf-body mt-4 text-muted">Курьерская доставка сейчас недоступна.</p>
          )}
        </section>

        <section className="sf-legal-block" aria-labelledby="suburb-delivery-heading">
          <h2 id="suburb-delivery-heading" className="sf-h3">
            За пределами Гродно
          </h2>
          <p className="sf-body mt-4 text-muted whitespace-pre-line">{outOfCityNote}</p>
          <p className="sf-body mt-3 text-muted">
            Отдельные страницы населённых пунктов не публикуем. Перед заказом уточните у магазина
            стоимость, срок и возможность доставки по вашему адресу —{' '}
            <Link href="/kontakty" className="sf-link">
              контакты
            </Link>
            .
          </p>
        </section>

        <section className="sf-legal-block" aria-labelledby="pickup-heading">
          <h2 id="pickup-heading" className="sf-h3">
            Самовывоз
          </h2>
          {!fulfillment ? (
            <p className="sf-body mt-4 text-muted">Условия самовывоза уточняйте у менеджера.</p>
          ) : fulfillment.pickupEnabled ? (
            <dl className="sf-legal-dl mt-5">
              <div>
                <dt>Адрес</dt>
                <dd>
                  {pickupAddress ? <span className="block">{pickupAddress}</span> : null}
                  {fulfillment.pickupInstructions?.trim() ? (
                    <span className="mt-1 block text-muted">
                      {fulfillment.pickupInstructions.trim()}
                    </span>
                  ) : pickupAddress ? null : (
                    'Доступен — адрес и время сообщит менеджер'
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="sf-body mt-4 text-muted">Самовывоз сейчас недоступен.</p>
          )}
        </section>

        <section className="sf-legal-block" aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="sf-h3">
            Оплата
          </h2>
          <p className="sf-body mt-4 whitespace-pre-line text-muted">{offlinePayment}</p>
        </section>
      </div>

      <section className="mt-10 max-w-[40rem]" aria-labelledby="doc-heading">
        <h2 id="doc-heading" className="sr-only">
          {deliveryDoc.title}
        </h2>
        <SafeMarkdown markdown={deliveryDoc.bodyMarkdown} className="sf-legal-prose" />
      </section>

      <LegalRelatedNav
        links={[
          { href: '/oferta', label: 'Условия заказа' },
          { href: '/vozvrat', label: 'Возврат и отмена' },
          { href: '/kontakty', label: 'Контакты' },
        ]}
      />
    </LegalPageShell>
  );
}

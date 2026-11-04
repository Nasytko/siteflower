import type { Metadata } from 'next';
import { LegalPageShell, LegalRelatedNav } from '@/components/storefront/legal-document-view';
import { SafeMarkdown } from '@/components/storefront/safe-markdown';
import {
  FIXED_SELLER,
  getFixedLegalDocument,
  getFixedLegalSeller,
} from '@/lib/legal-content';
import { isManagerTimeWindowId } from '@bouquet-one/contracts';
import { getFulfillmentOptions, getStorefrontSettings } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Доставка и оплата',
  description: 'Условия доставки и оплаты букетов в Гродно — сроки, окна, самовывоз.',
  path: '/dostavka',
});

function formatFee(minor: string, currency: string): string {
  const value = Number(minor);
  if (!Number.isFinite(value) || value <= 0) return 'Бесплатно';
  return `${(value / 100).toFixed(0)} ${currency}`;
}

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
  const pickupAddress = seller.pickupAddress?.trim() || null;
  const offlinePayment = FIXED_SELLER.actualOfflinePaymentDescription;
  const windows =
    fulfillment?.timeWindows
      .filter((w) => w.active !== false && !isManagerTimeWindowId(w.id))
      .sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  return (
    <LegalPageShell>
      <header className="sf-legal-page-intro">
        <p className="sf-label">{city}</p>
        <h1 className="sf-display">Доставка и оплата</h1>
        {summary ? (
          <p className="sf-body mt-4 whitespace-pre-line text-muted">{summary}</p>
        ) : (
          <p className="sf-body mt-4 text-muted">
            После оформления заказа менеджер свяжется, чтобы подтвердить детали доставки или
            самовывоза.
          </p>
        )}
      </header>

      <div className="sf-legal-grid">
        <section className="sf-legal-block" aria-labelledby="fulfillment-heading">
          <h2 id="fulfillment-heading" className="sf-h3">
            Получение заказа
          </h2>

          {!fulfillment ? (
            <p className="sf-body mt-4 text-muted">
              Актуальные условия уточняйте у менеджера после оформления заказа.
            </p>
          ) : (
            <dl className="sf-legal-dl mt-5">
              {fulfillment.deliveryEnabled ? (
                <div>
                  <dt>Курьерская доставка</dt>
                  <dd>
                    {[
                      formatFee(fulfillment.deliveryFeeMinor, fulfillment.currency),
                      formatLeadTime(fulfillment.minLeadTimeMinutes),
                      `по ${city}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </dd>
                </div>
              ) : (
                <div>
                  <dt>Курьерская доставка</dt>
                  <dd>Сейчас недоступна</dd>
                </div>
              )}

              {fulfillment.pickupEnabled ? (
                <div>
                  <dt>Самовывоз</dt>
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
              ) : (
                <div>
                  <dt>Самовывоз</dt>
                  <dd>Сейчас недоступен</dd>
                </div>
              )}

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

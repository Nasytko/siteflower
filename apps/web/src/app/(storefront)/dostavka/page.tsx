import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getFulfillmentOptions,
  getLegalDocument,
  getLegalSeller,
  getStorefrontSettings,
  PublicApiError,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { SafeMarkdown } from '@/components/storefront/safe-markdown';

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
  const [settings, fulfillment, seller, deliveryDoc] = await Promise.all([
    getStorefrontSettings().catch(() => null),
    getFulfillmentOptions().catch(() => null),
    getLegalSeller().catch(() => null),
    getLegalDocument('delivery_payment').catch((error: unknown) => {
      if (error instanceof PublicApiError && error.status === 404) return null;
      return null;
    }),
  ]);

  const city = seller?.city ?? settings?.city ?? 'Гродно';
  const summary = settings?.deliverySummary?.trim() || null;
  const pickupAddress = seller?.pickupAddress?.trim() || null;
  const offlinePayment = seller?.actualOfflinePaymentDescription?.trim() || null;
  const windows =
    fulfillment?.timeWindows.filter((w) => w.active !== false).sort((a, b) => a.sortOrder - b.sortOrder) ??
    [];

  return (
    <main id="main-content" className="sf-legal-page">
      <div className="sf-legal-page__glow" aria-hidden="true" />
      <div className="sf-container py-14 md:py-20">
        <header className="max-w-2xl">
          <p className="sf-label mb-3">{city}</p>
          <h1 className="sf-display">Доставка и оплата</h1>
          {summary ? (
            <p className="sf-body mt-5 whitespace-pre-line text-muted">{summary}</p>
          ) : (
            <p className="sf-body mt-5 text-muted">
              После оформления заказа менеджер свяжется, чтобы подтвердить детали доставки или
              самовывоза.
            </p>
          )}
        </header>

        <div className="sf-legal-grid mt-14">
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
                      {pickupAddress ? (
                        <span className="block">{pickupAddress}</span>
                      ) : null}
                      {fulfillment.pickupInstructions?.trim() ? (
                        <span className="mt-1 block text-muted">
                          {fulfillment.pickupInstructions.trim()}
                        </span>
                      ) : pickupAddress ? null : (
                        'Доступен — адрес уточнит менеджер'
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
                    <dt>Окна времени</dt>
                    <dd>
                      <ul className="mt-1 space-y-1">
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
            <p className="sf-body mt-4 text-muted">
              Онлайн-оплата на сайте не принимается. После оформления заказа менеджер свяжется и
              подскажет доступные офлайн-способы оплаты.
            </p>
            {offlinePayment ? (
              <p className="sf-body mt-4 whitespace-pre-line text-foreground">{offlinePayment}</p>
            ) : null}
          </section>
        </div>

        {deliveryDoc?.bodyMarkdown?.trim() ? (
          <section className="mt-16 max-w-2xl" aria-labelledby="doc-heading">
            <h2 id="doc-heading" className="sf-h3">
              {deliveryDoc.title}
            </h2>
            <SafeMarkdown markdown={deliveryDoc.bodyMarkdown} className="sf-legal-prose mt-6" />
          </section>
        ) : null}

        <nav className="mt-14 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Связанные страницы">
          <Link href="/oferta" className="font-medium text-brand hover:underline">
            Условия заказа
          </Link>
          <Link href="/vozvrat" className="font-medium text-brand hover:underline">
            Возврат и отмена
          </Link>
          <Link href="/kontakty" className="font-medium text-brand hover:underline">
            Контакты
          </Link>
        </nav>
      </div>
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { getStorefrontSettings } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Доставка',
  description: 'Доставка букетов по Гродно — условия и детали.',
  path: '/dostavka',
});

export default async function DeliveryPage() {
  const settings = await getStorefrontSettings().catch(() => null);
  const summary =
    settings?.deliverySummary ??
    'Доставляем букеты по Гродно. После оформления заказа менеджер свяжется для подтверждения деталей.';

  return (
    <main id="main-content" className="sf-container py-12 md:py-16">
      <header className="max-w-2xl">
        <h1 className="sf-h1">Доставка</h1>
        <p className="sf-body mt-4 whitespace-pre-line text-muted">{summary}</p>
      </header>

      <dl className="mt-12 max-w-xl space-y-6">
        {settings?.city ? (
          <div>
            <dt className="sf-label">Город</dt>
            <dd className="mt-1 text-foreground">{settings.city}</dd>
          </div>
        ) : null}
        {settings?.workingHours ? (
          <div>
            <dt className="sf-label">Часы работы</dt>
            <dd className="mt-1 text-foreground">{settings.workingHours}</dd>
          </div>
        ) : null}
        {settings?.address ? (
          <div>
            <dt className="sf-label">Адрес</dt>
            <dd className="mt-1 text-foreground">{settings.address}</dd>
          </div>
        ) : null}
        {settings?.phone ? (
          <div>
            <dt className="sf-label">Телефон</dt>
            <dd className="mt-1">
              <a href={`tel:${settings.phone.replace(/\s+/g, '')}`}>{settings.phone}</a>
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-12">
        <Link href="/bukety" className="text-sm font-medium text-brand hover:underline">
          Перейти в каталог
        </Link>
      </p>
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { getStorefrontSettings } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'О нас',
  description: 'БУКЕТ №1 — цветочный магазин в Гродно.',
  path: '/o-nas',
});

export default async function AboutPage() {
  const settings = await getStorefrontSettings().catch(() => null);
  const about =
    settings?.aboutSummary ??
    'БУКЕТ №1 — цветочный магазин в Гродно. Собираем букеты, которые хочется дарить: свежие цветы, аккуратная сборка, понятная доставка.';

  return (
    <main id="main-content" className="sf-container py-12 md:py-16">
      <header className="max-w-2xl">
        <p className="sf-label mb-3">{settings?.city ?? 'Гродно'}</p>
        <h1 className="sf-display">{settings?.brandName ?? 'БУКЕТ №1'}</h1>
        <p className="sf-body mt-6 whitespace-pre-line text-muted">{about}</p>
      </header>

      <ul className="mt-12 max-w-xl space-y-3 text-sm">
        {settings?.phone ? (
          <li>
            <a href={`tel:${settings.phone.replace(/\s+/g, '')}`}>{settings.phone}</a>
          </li>
        ) : null}
        {settings?.email ? (
          <li>
            <a href={`mailto:${settings.email}`}>{settings.email}</a>
          </li>
        ) : null}
        {settings?.instagramUrl ? (
          <li>
            <a href={settings.instagramUrl} rel="noopener noreferrer" target="_blank">
              Instagram
            </a>
          </li>
        ) : null}
        {settings?.telegramUrl ? (
          <li>
            <a href={settings.telegramUrl} rel="noopener noreferrer" target="_blank">
              Telegram
            </a>
          </li>
        ) : null}
      </ul>

      <p className="mt-12">
        <Link href="/bukety" className="text-sm font-medium text-brand hover:underline">
          Смотреть букеты
        </Link>
      </p>
    </main>
  );
}

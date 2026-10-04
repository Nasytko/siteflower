import Link from 'next/link';
import {
  roleHasPermission,
  seoStatusEmoji,
  type SeoHealthSummary,
} from '@bouquet-one/contracts';
import { fetchAdminMe, adminFetch } from '@/lib/admin-api';
import { fetchTotal } from '@/lib/admin-catalog-api';
import { adminEndpoints } from '@/lib/admin-endpoints';

const SHORTCUTS = [
  {
    href: '/admin/catalog/products',
    label: 'Товары',
    hint: 'Найти, наличие, публикация',
    permission: 'CATALOG_READ' as const,
  },
  {
    href: '/admin/orders',
    label: 'Заказы',
    hint: 'Список на дату выполнения',
    permission: 'ORDERS_READ' as const,
  },
  {
    href: '/admin/promotions',
    label: 'Акции',
    hint: 'Скидки и сроки',
    permission: 'CATALOG_READ' as const,
  },
];

function Metric({
  label,
  value,
  hint,
  href,
  emphasize,
}: {
  label: string;
  value: number | null;
  hint: string;
  href?: string;
  emphasize?: boolean;
}) {
  const body = (
    <>
      <p className="admin-card__label">{label}</p>
      <p className={`admin-metric ${emphasize && value !== null && value > 0 ? 'text-[var(--admin-brand)]' : ''}`}>
        {value === null ? '—' : value}
      </p>
      <p className="text-sm text-[var(--admin-muted)]">{value === null ? 'Нет данных' : hint}</p>
    </>
  );
  return href ? (
    <Link href={href} className="admin-card admin-card--link">
      {body}
    </Link>
  ) : (
    <div className="admin-card">{body}</div>
  );
}

export default async function AdminDashboardPage() {
  const me = await fetchAdminMe();
  const role = me?.user.role;
  const canReadOrders = Boolean(role && roleHasPermission(role, 'ORDERS_READ'));
  const canReadCatalog = Boolean(role && roleHasPermission(role, 'CATALOG_READ'));
  const canCreateCatalog = Boolean(role && roleHasPermission(role, 'CATALOG_CREATE'));
  const canReadSeo = Boolean(role && roleHasPermission(role, 'SEO_READ'));

  const [ordersToday, ordersTomorrow, ordersNew, publishedProducts, promotedProducts, seoSummary] =
    await Promise.all([
      canReadOrders ? fetchTotal(adminEndpoints.orders, { date: 'today' }) : null,
      canReadOrders ? fetchTotal(adminEndpoints.orders, { date: 'tomorrow' }) : null,
      canReadOrders
        ? fetchTotal(adminEndpoints.orders, { date: 'all', status: 'RECEIVED' })
        : null,
      canReadCatalog
        ? fetchTotal(adminEndpoints.products, { lifecycle: 'PUBLISHED' })
        : null,
      canReadCatalog ? fetchTotal(adminEndpoints.products, { promotionalOnly: true }) : null,
      canReadSeo
        ? adminFetch<{ summary: SeoHealthSummary }>(adminEndpoints.seoSummary).catch(() => null)
        : null,
    ]);

  const shortcuts = SHORTCUTS.filter((item) => role && roleHasPermission(role, item.permission));
  const seoNeedsAttention =
    seoSummary && (seoSummary.summary.attention > 0 || seoSummary.summary.improve > 0);

  return (
    <main id="main-content" className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="admin-page-title">Сводка</h1>
          <p className="admin-page-lead">
            {me?.user.displayName ? `${me.user.displayName}, ` : ''}что нужно сделать сейчас.
          </p>
        </div>
        {canCreateCatalog ? (
          <Link
            href="/admin/catalog/products"
            className="inline-flex items-center rounded-lg bg-[var(--admin-brand)] px-4 py-2.5 text-sm font-semibold text-white no-underline hover:opacity-95"
          >
            Новый товар
          </Link>
        ) : null}
      </header>

      {canReadOrders ? (
        <section className="space-y-3">
          <h2 className="admin-section__eyebrow">Заказы</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Требуют внимания"
              value={ordersNew}
              hint="Новые, ещё не подтверждены"
              href="/admin/orders?date=all&status=RECEIVED"
              emphasize
            />
            <Metric
              label="На сегодня"
              value={ordersToday}
              hint="Выдача и доставка сегодня"
              href="/admin/orders?date=today"
            />
            <Metric
              label="На завтра"
              value={ordersTomorrow}
              hint="Готовим заранее"
              href="/admin/orders?date=tomorrow"
            />
          </div>
        </section>
      ) : null}

      {canReadCatalog ? (
        <section className="space-y-3">
          <h2 className="admin-section__eyebrow">Каталог</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Metric
              label="Товары на витрине"
              value={publishedProducts}
              hint="Опубликованные букеты"
              href="/admin/catalog/products?lifecycle=PUBLISHED"
            />
            <Metric
              label="Товары в акции"
              value={promotedProducts}
              hint="Скидка активна сейчас"
              href="/admin/promotions"
            />
          </div>
        </section>
      ) : null}

      {canReadSeo && seoNeedsAttention ? (
        <section className="space-y-3">
          <h2 className="admin-section__eyebrow">SEO</h2>
          <Link href="/admin/seo" className="admin-card admin-card--link block max-w-xl">
            <p className="admin-card__label">SEO требует внимания</p>
            <p className="mt-2 text-base">
              {seoSummary.summary.attention > 0 ? (
                <span className="mr-4">
                  {seoStatusEmoji('attention')} {seoSummary.summary.attention} страниц
                </span>
              ) : null}
              {seoSummary.summary.improve > 0 ? (
                <span>
                  {seoStatusEmoji('improve')} {seoSummary.summary.improve} страниц
                </span>
              ) : null}
            </p>
            <p className="mt-2 text-sm text-[var(--admin-muted)]">Посмотреть рекомендации →</p>
          </Link>
        </section>
      ) : null}

      {shortcuts.length > 0 ? (
        <section className="space-y-3">
          <h2 className="admin-section__eyebrow">Быстрые действия</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {shortcuts.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="admin-quick-link">
                  <span>
                    <span className="block font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-sm text-[var(--admin-muted)]">
                      {item.hint}
                    </span>
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

import Link from 'next/link';
import {
  orderStatusLabel,
  roleHasPermission,
  seoStatusEmoji,
  type OrderAdminListItemDto,
  type SeoHealthSummary,
} from '@bouquet-one/contracts';
import { fetchAdminMe, adminFetch } from '@/lib/admin-api';
import { fetchTotal } from '@/lib/admin-catalog-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { formatPriceFromMinor } from '@/lib/media';

const SHORTCUTS = [
  {
    href: '/admin/catalog/products',
    label: 'Товары',
    hint: 'Создать или найти',
    permission: 'CATALOG_READ' as const,
  },
  {
    href: '/admin/orders',
    label: 'Заказы',
    hint: 'Сегодня и новые',
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
  const urgent = Boolean(emphasize && value !== null && value > 0);
  const cardClass = `admin-card admin-card--kpi${href ? ' admin-card--link' : ''}${urgent ? ' admin-card--urgent' : ''}`;
  const body = (
    <>
      <p className="admin-card__label">{label}</p>
      <p className={`admin-metric ${urgent ? 'text-[#a12a1f]' : ''}`}>
        {value === null ? '—' : value}
      </p>
      <p className="text-sm text-[var(--admin-muted)]">{value === null ? 'Нет данных' : hint}</p>
    </>
  );
  return href ? (
    <Link href={href} className={cardClass}>
      {body}
    </Link>
  ) : (
    <div className={cardClass}>{body}</div>
  );
}

function formatToday(): string {
  return new Intl.DateTimeFormat('ru-BY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

export default async function AdminDashboardPage() {
  const me = await fetchAdminMe();
  const role = me?.user.role;
  const canReadOrders = Boolean(role && roleHasPermission(role, 'ORDERS_READ'));
  const canReadCatalog = Boolean(role && roleHasPermission(role, 'CATALOG_READ'));
  const canCreateCatalog = Boolean(role && roleHasPermission(role, 'CATALOG_CREATE'));
  const canReadSeo = Boolean(role && roleHasPermission(role, 'SEO_READ'));

  const [
    ordersToday,
    ordersNew,
    publishedProducts,
    promotedProducts,
    recentOrders,
    seoSummary,
  ] = await Promise.all([
    canReadOrders ? fetchTotal(adminEndpoints.orders, { date: 'today' }) : null,
    canReadOrders
      ? fetchTotal(adminEndpoints.orders, { date: 'all', status: 'RECEIVED' })
      : null,
    canReadCatalog ? fetchTotal(adminEndpoints.products, { lifecycle: 'PUBLISHED' }) : null,
    canReadCatalog ? fetchTotal(adminEndpoints.products, { promotionalOnly: true }) : null,
    canReadOrders
      ? adminFetch<{ items: OrderAdminListItemDto[] }>(
          `${adminEndpoints.orders}?date=all&page=1&pageSize=5`,
        ).catch(() => ({ items: [] as OrderAdminListItemDto[] }))
      : null,
    canReadSeo
      ? adminFetch<{ summary: SeoHealthSummary }>(adminEndpoints.seoSummary).catch(() => null)
      : null,
  ]);

  const shortcuts = SHORTCUTS.filter((item) => role && roleHasPermission(role, item.permission));
  const seoNeedsAttention =
    seoSummary && (seoSummary.summary.attention > 0 || seoSummary.summary.improve > 0);
  const firstName = me?.user.displayName?.trim().split(/\s+/)[0] ?? '';

  return (
    <main id="main-content" className="space-y-8">
      <header className="admin-page-header">
        <div className="admin-page-header__text">
          <h1 className="admin-page-title">
            {firstName ? `Добро пожаловать, ${firstName}` : 'Сводка'}
          </h1>
          <p className="admin-page-lead">
            {formatToday()}. {canCreateCatalog ? 'Начните с товара или заказов.' : 'Что нужно сделать сейчас.'}
          </p>
        </div>
        {canCreateCatalog ? (
          <div className="admin-page-header__actions">
            <Link href="/admin/catalog/products#create-product" className="admin-btn">
              Новый товар
            </Link>
          </div>
        ) : null}
      </header>

      {canReadOrders || canReadCatalog ? (
        <section className="admin-kpi-grid">
          {canReadOrders ? (
            <Metric
              label="Новые заказы"
              value={ordersNew}
              hint="Ещё не подтверждены"
              href="/admin/orders?date=all&status=RECEIVED"
              emphasize
            />
          ) : null}
          {canReadCatalog ? (
            <Metric
              label="Товары на витрине"
              value={publishedProducts}
              hint="Опубликованные"
              href="/admin/catalog/products?lifecycle=PUBLISHED"
            />
          ) : null}
          {canReadOrders ? (
            <Metric
              label="На сегодня"
              value={ordersToday}
              hint="Выдача и доставка"
              href="/admin/orders?date=today"
            />
          ) : null}
          {canReadCatalog ? (
            <Metric
              label="В акции"
              value={promotedProducts}
              hint="Скидка сейчас"
              href="/admin/promotions"
            />
          ) : null}
        </section>
      ) : null}

      {canReadOrders && recentOrders ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="admin-section__eyebrow">Последние заказы</h2>
            <Link href="/admin/orders?date=all" className="admin-link text-sm">
              Все заказы
            </Link>
          </div>
          <div className="admin-panel admin-table-wrap admin-table-wrap--cards">
            <table className="admin-table admin-table--compact">
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Дата</th>
                  <th>Клиент</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.items.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <p className="admin-empty">Заказов пока нет.</p>
                    </td>
                  </tr>
                ) : (
                  recentOrders.items.map((order) => (
                    <tr key={order.id}>
                      <td data-primary>
                        <Link href={`/admin/orders/${order.id}`} className="font-semibold">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td data-label="Дата" className="tabular-nums">
                        {order.fulfillmentDate}
                      </td>
                      <td data-label="Клиент">{order.purchaserName}</td>
                      <td data-label="Сумма" className="tabular-nums">
                        {formatPriceFromMinor(order.totalMinor, order.currency)}
                      </td>
                      <td data-label="Статус">
                        <span className="admin-chip">{orderStatusLabel(order.status)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canReadSeo && seoNeedsAttention && seoSummary ? (
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

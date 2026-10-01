import Link from 'next/link';
import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchAdminMe } from '@/lib/admin-api';
import { fetchTotal } from '@/lib/admin-catalog-api';
import { adminEndpoints } from '@/lib/admin-endpoints';

const SHORTCUTS = [
  {
    href: '/admin/orders',
    label: 'Заказы',
    hint: 'Список на дату выполнения',
    permission: 'ORDERS_READ' as const,
  },
  {
    href: '/admin/catalog/products',
    label: 'Товары',
    hint: 'Цены, фото, публикация',
    permission: 'CATALOG_READ' as const,
  },
  {
    href: '/admin/promotions',
    label: 'Акции',
    hint: 'Скидки и сроки',
    permission: 'CATALOG_READ' as const,
  },
  {
    href: '/admin/bestsellers',
    label: 'Бестселлеры',
    hint: 'Подборки для главной',
    permission: 'CATALOG_READ' as const,
  },
  {
    href: '/admin/fulfillment',
    label: 'Получение и доставка',
    hint: 'Окна времени и способы',
    permission: 'SETTINGS_READ' as const,
  },
];

function Metric({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number | null;
  hint: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="admin-card__label">{label}</p>
      <p className="admin-metric">{value === null ? '—' : value}</p>
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

  const [ordersToday, ordersTomorrow, ordersNew, publishedProducts, promotedProducts] =
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
    ]);

  const shortcuts = SHORTCUTS.filter((item) => role && roleHasPermission(role, item.permission));

  return (
    <main id="main-content" className="space-y-8">
      <header>
        <h1 className="admin-page-title">Сводка</h1>
        <p className="admin-page-lead">
          {me?.user.displayName ? `${me.user.displayName}, ` : ''}вот что в магазине прямо сейчас.
        </p>
      </header>

      {canReadOrders ? (
        <section className="space-y-3">
          <h2 className="admin-section__eyebrow">Заказы</h2>
          <div className="grid gap-4 sm:grid-cols-3">
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
            <Metric
              label="Требуют внимания"
              value={ordersNew}
              hint="Новые, ещё не подтверждены"
              href="/admin/orders?date=all&status=RECEIVED"
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

      {shortcuts.length > 0 ? (
        <section className="space-y-3">
          <h2 className="admin-section__eyebrow">Быстрые переходы</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
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

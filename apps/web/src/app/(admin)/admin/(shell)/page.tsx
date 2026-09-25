import Link from 'next/link';
import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchAdminMe } from '@/lib/admin-api';

const SHORTCUTS = [
  {
    href: '/admin/orders',
    label: 'Заказы',
    hint: 'Обработка и статусы',
    permission: 'ORDERS_READ' as const,
  },
  {
    href: '/admin/catalog/products',
    label: 'Товары',
    hint: 'Каталог и публикация',
    permission: 'CATALOG_READ' as const,
  },
  {
    href: '/admin/storefront/homepage',
    label: 'Главная',
    hint: 'Hero и секции витрины',
    permission: 'CONTENT_READ' as const,
  },
  {
    href: '/admin/storefront/settings',
    label: 'Настройки',
    hint: 'Контакты и бренд',
    permission: 'SETTINGS_READ' as const,
  },
];

export default async function AdminDashboardPage() {
  const me = await fetchAdminMe();
  const role = me?.user.role;

  const shortcuts = SHORTCUTS.filter(
    (item) => role && roleHasPermission(role, item.permission),
  );

  return (
    <main id="main-content" className="space-y-8">
      <header>
        <h1 className="admin-page-title">Панель</h1>
        <p className="admin-page-lead">
          Добро пожаловать{me?.user.displayName ? `, ${me.user.displayName}` : ''}. Управляйте
          каталогом, заказами и витриной.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="admin-card">
          <p className="admin-card__label">Пользователь</p>
          <p className="mt-2 text-lg font-semibold text-[var(--admin-ink)]">
            {me?.user.displayName}
          </p>
          <p className="text-sm text-[var(--admin-muted)]">{me?.user.email}</p>
        </div>
        <div className="admin-card">
          <p className="admin-card__label">Роль</p>
          <p className="mt-2 text-lg font-semibold text-[var(--admin-ink)]">{me?.user.role}</p>
          <p className="text-sm text-[var(--admin-muted)]">
            {me?.user.permissions.length ?? 0} разрешений
          </p>
        </div>
      </section>

      {shortcuts.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">
            Быстрые переходы
          </h2>
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

      <section className="admin-card">
        <p className="admin-card__label">Статус</p>
        <p className="mt-2 text-[var(--admin-ink)]">
          Session auth · RBAC · audit · catalog CMS
        </p>
        <p className="mt-1 text-sm text-[var(--admin-muted)]">
          Показаны только реальные operational-данные — без выдуманных метрик продаж.
        </p>
      </section>
    </main>
  );
}

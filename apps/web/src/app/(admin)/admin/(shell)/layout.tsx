import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { roleHasPermission, type Permission } from '@bouquet-one/contracts';
import { fetchAdminMe } from '@/lib/admin-api';
import { LogoutButton } from '@/components/admin/logout-button';

const NAV: Array<{ href: string; label: string; permission?: Permission; soon?: boolean }> = [
  { href: '/admin', label: 'Обзор' },
  { href: '/admin/orders', label: 'Заказы', permission: 'ORDERS_READ' },
  { href: '/admin/catalog/products', label: 'Товары', permission: 'CATALOG_READ' },
  { href: '/admin/catalog/categories', label: 'Категории', permission: 'CATALOG_READ' },
  { href: '/admin/catalog/collections', label: 'Коллекции', permission: 'CATALOG_READ' },
  { href: '/admin/catalog/flowers', label: 'Цветы', permission: 'CATALOG_READ' },
  { href: '/admin/catalog/occasions', label: 'Поводы', permission: 'CATALOG_READ' },
  { href: '/admin/catalog/recipients', label: 'Кому', permission: 'CATALOG_READ' },
  { href: '/admin/catalog/styles', label: 'Стили', permission: 'CATALOG_READ' },
  { href: '/admin/catalog/colors', label: 'Цвета', permission: 'CATALOG_READ' },
  { href: '/admin/users', label: 'Пользователи', permission: 'USERS_READ' },
  { href: '/admin/audit', label: 'Аудит', permission: 'AUDIT_READ' },
  { href: '/admin/storefront/homepage', label: 'Главная', permission: 'CONTENT_READ' },
  { href: '/admin/storefront/settings', label: 'Настройки', permission: 'SETTINGS_READ' },
  { href: '/admin/fulfillment', label: 'Доставка', permission: 'SETTINGS_READ' },
  { href: '#', label: 'Site Health', soon: true },
];

export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const me = await fetchAdminMe();
  if (!me) {
    redirect('/admin/login');
  }

  const visibleNav = NAV.filter((item) => {
    if (item.soon) return true;
    if (!item.permission) return true;
    return roleHasPermission(me.user.role, item.permission);
  });

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-stone-200 bg-stone-50 lg:border-b-0 lg:border-r">
        <div className="px-5 py-6">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Админ</p>
          <p className="mt-1 text-xl font-semibold text-stone-900">БУКЕТ №1</p>
        </div>
        <nav aria-label="Admin" className="flex flex-wrap gap-1 px-3 pb-4 lg:flex-col">
          {visibleNav.map((item) =>
            item.soon ? (
              <span
                key={item.label}
                className="rounded-md px-3 py-2 text-sm text-stone-400"
                title="Скоро"
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-stone-800 hover:bg-stone-200"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="border-t border-stone-200 px-5 py-4 text-sm text-stone-600">
          <p className="font-medium text-stone-900">{me.user.displayName}</p>
          <p>{me.user.email}</p>
          <p className="mt-1 text-xs uppercase tracking-wide">{me.user.role}</p>
          <div className="mt-3">
            <LogoutButton />
          </div>
        </div>
      </aside>
      <div className="px-6 py-8 lg:px-10">{children}</div>
    </div>
  );
}

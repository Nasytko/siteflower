'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminRole, Permission } from '@bouquet-one/contracts';
import { roleHasPermission } from '@bouquet-one/contracts';

type NavItem = {
  href: string;
  label: string;
  permission?: Permission;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Обзор',
    items: [{ href: '/admin', label: 'Панель' }],
  },
  {
    id: 'commerce',
    label: 'Коммерция',
    items: [{ href: '/admin/orders', label: 'Заказы', permission: 'ORDERS_READ' }],
  },
  {
    id: 'catalog',
    label: 'Каталог',
    items: [
      { href: '/admin/catalog/products', label: 'Товары', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/collections', label: 'Коллекции', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/categories', label: 'Категории', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/flowers', label: 'Цветы', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/occasions', label: 'Поводы', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/recipients', label: 'Кому', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/styles', label: 'Стили', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/colors', label: 'Цвета', permission: 'CATALOG_READ' },
    ],
  },
  {
    id: 'storefront',
    label: 'Витрина',
    items: [
      { href: '/admin/storefront/homepage', label: 'Главная страница', permission: 'CONTENT_READ' },
      { href: '/admin/storefront/settings', label: 'Настройки витрины', permission: 'SETTINGS_READ' },
      { href: '/admin/fulfillment', label: 'Доставка и самовывоз', permission: 'SETTINGS_READ' },
    ],
  },
  {
    id: 'system',
    label: 'Система',
    items: [
      { href: '/admin/users', label: 'Пользователи', permission: 'USERS_READ' },
      { href: '/admin/audit', label: 'Аудит', permission: 'AUDIT_READ' },
    ],
  },
];

type Props = {
  role: AdminRole;
};

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShellNav({ role }: Props) {
  const pathname = usePathname();

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || roleHasPermission(role, item.permission),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <nav aria-label="Админка" className="admin-nav">
      {groups.map((group) => (
        <div key={group.id} className="admin-nav__group">
          <p className="admin-nav__group-label">{group.label}</p>
          <ul className="admin-nav__list">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`admin-nav__link ${active ? 'admin-nav__link--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

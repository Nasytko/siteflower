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

/** Florist store panel: work first, then catalog dictionaries, then merchandising. */
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'work',
    label: 'Работа',
    items: [{ href: '/admin/orders', label: 'Заказы', permission: 'ORDERS_READ' }],
  },
  {
    id: 'catalog',
    label: 'Каталог',
    items: [
      { href: '/admin/catalog/products', label: 'Товары', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/flowers', label: 'Цветы', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/colors', label: 'Цвета', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/bouquet-sizes', label: 'Размеры', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/product-lines', label: 'Линейки', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/occasions', label: 'Поводы', permission: 'CATALOG_READ' },
      { href: '/admin/catalog/recipients', label: 'Кому', permission: 'CATALOG_READ' },
    ],
  },
  {
    id: 'promotion',
    label: 'Продвижение',
    items: [
      { href: '/admin/promotions', label: 'Акции', permission: 'CATALOG_READ' },
      { href: '/admin/bestsellers', label: 'Бестселлеры', permission: 'CATALOG_READ' },
      { href: '/admin/storefront/instagram', label: 'Instagram', permission: 'CONTENT_READ' },
      { href: '/admin/storefront/homepage', label: 'Главная', permission: 'CONTENT_READ' },
    ],
  },
  {
    id: 'shop',
    label: 'Магазин',
    items: [
      { href: '/admin/fulfillment', label: 'Получение и доставка', permission: 'SETTINGS_READ' },
      { href: '/admin/storefront/settings', label: 'Настройки', permission: 'SETTINGS_READ' },
      { href: '/admin/legal', label: 'Юридическая информация', permission: 'LEGAL_READ' },
      { href: '/admin/integrations/erp', label: 'ERP', permission: 'INTEGRATION_READ' },
    ],
  },
  {
    id: 'management',
    label: 'Управление',
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
    <nav aria-label="Разделы админки" className="admin-nav">
      <ul className="admin-nav__list">
        <li>
          <Link
            href="/admin"
            className={`admin-nav__link ${pathname === '/admin' ? 'admin-nav__link--active' : ''}`}
            aria-current={pathname === '/admin' ? 'page' : undefined}
          >
            Сводка
          </Link>
        </li>
      </ul>

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

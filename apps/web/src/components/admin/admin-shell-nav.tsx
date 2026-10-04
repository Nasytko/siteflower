'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminRole, Permission } from '@bouquet-one/contracts';
import { roleHasPermission } from '@bouquet-one/contracts';
import { TAXONOMY_KINDS } from '@/lib/admin-endpoints';

type NavItem = {
  href: string;
  label: string;
  permission?: Permission;
  /** When set, used instead of href prefix matching. */
  isActive?: (pathname: string) => boolean;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const DICTIONARY_HREFS = TAXONOMY_KINDS.map((kind) => `/admin/catalog/${kind}`);

function isDictionaryPath(pathname: string): boolean {
  return DICTIONARY_HREFS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

/**
 * Florist store panel IA:
 * Работа → daily ops · Каталог → merchandising · Магазин → public site · Система → rare/tech
 */
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'work',
    label: 'Работа',
    items: [
      {
        href: '/admin',
        label: 'Сводка',
        isActive: (pathname) => pathname === '/admin',
      },
      { href: '/admin/orders', label: 'Заказы', permission: 'ORDERS_READ' },
    ],
  },
  {
    id: 'catalog',
    label: 'Каталог',
    items: [
      { href: '/admin/catalog/products', label: 'Товары', permission: 'CATALOG_READ' },
      {
        href: '/admin/catalog/flowers',
        label: 'Справочники',
        permission: 'CATALOG_READ',
        isActive: isDictionaryPath,
      },
      { href: '/admin/promotions', label: 'Акции', permission: 'CATALOG_READ' },
      { href: '/admin/bestsellers', label: 'Бестселлеры', permission: 'CATALOG_READ' },
    ],
  },
  {
    id: 'store',
    label: 'Магазин',
    items: [
      {
        href: '/admin/storefront/homepage',
        label: 'Главная страница',
        permission: 'CONTENT_READ',
      },
      { href: '/admin/storefront/instagram', label: 'Instagram', permission: 'CONTENT_READ' },
      {
        href: '/admin/storefront/settings',
        label: 'Настройки магазина',
        permission: 'SETTINGS_READ',
      },
      { href: '/admin/seo', label: 'SEO', permission: 'SEO_READ' },
      { href: '/admin/fulfillment', label: 'Доставка и получение', permission: 'SETTINGS_READ' },
      { href: '/admin/legal', label: 'Юридическая информация', permission: 'LEGAL_READ' },
    ],
  },
  {
    id: 'system',
    label: 'Система',
    items: [
      { href: '/admin/users', label: 'Пользователи', permission: 'USERS_READ' },
      { href: '/admin/audit', label: 'Аудит', permission: 'AUDIT_READ' },
      {
        href: '/admin/media-health',
        label: 'Состояние медиа',
        permission: 'SITE_HEALTH_READ',
      },
      {
        href: '/admin/integrations/erp',
        label: 'Интеграции',
        permission: 'INTEGRATION_READ',
      },
    ],
  },
];

type Props = {
  role: AdminRole;
};

function isActive(pathname: string, item: NavItem): boolean {
  if (item.isActive) return item.isActive(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
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
      {groups.map((group) => (
        <div key={group.id} className="admin-nav__group">
          <p className="admin-nav__group-label">{group.label}</p>
          <ul className="admin-nav__list">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={`${group.id}-${item.href}`}>
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

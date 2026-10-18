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
  /** Soft-demote rare/tech groups in the sidebar. */
  tier?: 'system';
  items: NavItem[];
};

const DICTIONARY_PATHS = [
  '/admin/catalog/dictionaries',
  '/admin/catalog/flower-structure',
  '/admin/catalog/categories',
  ...TAXONOMY_KINDS.map((kind) => `/admin/catalog/${kind}`),
];

function isDictionaryPath(pathname: string): boolean {
  return DICTIONARY_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

function isStorefrontHomePath(pathname: string): boolean {
  return (
    pathname === '/admin/storefront/homepage' ||
    pathname.startsWith('/admin/storefront/homepage/') ||
    pathname === '/admin/storefront/navigation' ||
    pathname.startsWith('/admin/storefront/navigation/')
  );
}

/**
 * Florist store panel IA:
 * Работа → orders · Каталог → goods & merchandising · Сайт → public site · Настройки + Система
 */
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
      {
        href: '/admin/catalog/dictionaries',
        label: 'Справочники',
        permission: 'CATALOG_READ',
        isActive: isDictionaryPath,
      },
      {
        href: '/admin/promotions',
        label: 'Акции и подборки',
        permission: 'CATALOG_READ',
        isActive: (pathname) =>
          pathname === '/admin/promotions' ||
          pathname.startsWith('/admin/promotions/') ||
          pathname === '/admin/bestsellers' ||
          pathname.startsWith('/admin/bestsellers/'),
      },
    ],
  },
  {
    id: 'site',
    label: 'Сайт',
    items: [
      {
        href: '/admin/storefront/homepage',
        label: 'Главная и меню',
        permission: 'CONTENT_READ',
        isActive: isStorefrontHomePath,
      },
      {
        href: '/admin/seo',
        label: 'Страницы каталога и SEO',
        permission: 'SEO_READ',
      },
      {
        href: '/admin/seo/landings',
        label: 'SEO-подборки',
        permission: 'SEO_READ',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Настройки',
    items: [
      {
        href: '/admin/fulfillment',
        label: 'Доставка и самовывоз',
        permission: 'SETTINGS_READ',
      },
      {
        href: '/admin/storefront/settings',
        label: 'Настройки магазина',
        permission: 'SETTINGS_READ',
      },
      { href: '/admin/users', label: 'Пользователи', permission: 'USERS_READ' },
    ],
  },
  {
    id: 'system',
    label: 'Система',
    tier: 'system',
    items: [
      { href: '/admin/audit', label: 'Журнал действий', permission: 'AUDIT_READ' },
      {
        href: '/admin/media-health',
        label: 'Состояние медиа',
        permission: 'SITE_HEALTH_READ',
      },
      {
        href: '/admin/integrations/erp',
        label: 'Синхронизация заказов',
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
        <div
          key={group.id}
          className="admin-nav__group"
          data-tier={group.tier}
        >
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

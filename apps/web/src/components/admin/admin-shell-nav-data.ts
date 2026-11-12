import type { AdminRole, Permission } from '@bouquet-one/contracts';
import { roleHasPermission } from '@bouquet-one/contracts';
import { TAXONOMY_KINDS } from '@/lib/admin-endpoints';

export type AdminNavItem = {
  href: string;
  label: string;
  permission?: Permission;
  /** When set, used instead of href prefix matching. */
  isActive?: (pathname: string) => boolean;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  /** Soft-demote rare/tech groups in the sidebar. */
  tier?: 'system';
  /** Multi-item groups start closed until the manager opens them or lands inside. */
  collapsed?: boolean;
  items: AdminNavItem[];
};

const DICTIONARY_PATHS = [
  '/admin/catalog/dictionaries',
  '/admin/catalog/flower-structure',
  '/admin/catalog/packaging',
  '/admin/catalog/categories',
  ...TAXONOMY_KINDS.map((kind) => `/admin/catalog/${kind}`),
];

function isDictionaryPath(pathname: string): boolean {
  return DICTIONARY_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

/**
 * Florist panel IA, in the order a manager works:
 * Сегодня · Каталог · Витрина · Доступ · Служебное
 */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'today',
    label: 'Сегодня',
    items: [
      {
        href: '/admin',
        label: 'Главная',
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
        href: '/admin/promotions',
        label: 'Акции',
        permission: 'CATALOG_READ',
        isActive: (pathname) =>
          pathname === '/admin/promotions' || pathname.startsWith('/admin/promotions/'),
      },
      {
        href: '/admin/bestsellers',
        label: 'Подборки',
        permission: 'CATALOG_READ',
        isActive: (pathname) =>
          pathname === '/admin/bestsellers' || pathname.startsWith('/admin/bestsellers/'),
      },
      {
        href: '/admin/catalog/dictionaries',
        label: 'Справочники',
        permission: 'CATALOG_READ',
        isActive: isDictionaryPath,
      },
    ],
  },
  {
    id: 'storefront',
    label: 'Витрина',
    collapsed: true,
    items: [
      {
        href: '/admin/catalog/pages',
        label: 'Страницы каталога',
        permission: 'CATALOG_READ',
        isActive: (pathname) =>
          pathname === '/admin/catalog/pages' ||
          pathname.startsWith('/admin/catalog/pages/') ||
          pathname === '/admin/seo/landings' ||
          pathname.startsWith('/admin/seo/landings/'),
      },
      {
        href: '/admin/storefront/hero',
        label: 'Баннер на главной',
        permission: 'CONTENT_READ',
        isActive: (pathname) =>
          pathname === '/admin/storefront/hero' ||
          pathname.startsWith('/admin/storefront/hero/'),
      },
      {
        href: '/admin/storefront/discovery',
        label: 'Плитки на главной',
        permission: 'CONTENT_READ',
        isActive: (pathname) =>
          pathname === '/admin/storefront/discovery' ||
          pathname.startsWith('/admin/storefront/discovery/'),
      },
      {
        href: '/admin/storefront/instagram',
        label: 'Instagram',
        permission: 'CONTENT_READ',
        isActive: (pathname) =>
          pathname === '/admin/storefront/instagram' ||
          pathname.startsWith('/admin/storefront/instagram/'),
      },
    ],
  },
  {
    id: 'access',
    label: 'Доступ',
    items: [{ href: '/admin/users', label: 'Пользователи', permission: 'USERS_READ' }],
  },
  {
    id: 'system',
    label: 'Служебное',
    tier: 'system',
    collapsed: true,
    items: [
      { href: '/admin/audit', label: 'Журнал действий', permission: 'AUDIT_READ' },
      {
        href: '/admin/seo',
        label: 'Диагностика SEO',
        permission: 'SEO_READ',
        isActive: (pathname) =>
          pathname === '/admin/seo' ||
          (pathname.startsWith('/admin/seo/') && !pathname.startsWith('/admin/seo/landings')),
      },
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

/** Visible sidebar groups for a role — used by UI and regression tests. */
export function adminNavGroupsForRole(role: AdminRole): AdminNavGroup[] {
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || roleHasPermission(role, item.permission),
    ),
  })).filter((group) => group.items.length > 0);
}

export function isAdminNavItemActive(pathname: string, item: AdminNavItem): boolean {
  if (item.isActive) return item.isActive(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

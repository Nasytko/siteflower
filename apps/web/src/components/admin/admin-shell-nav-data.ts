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
  items: AdminNavItem[];
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

/**
 * Florist store panel IA:
 * Работа → orders · Каталог → goods & merchandising · Сайт → public site · Настройки + Система
 */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'home',
    label: 'Магазин',
    items: [
      {
        href: '/admin',
        label: 'Главная',
        isActive: (pathname) => pathname === '/admin',
      },
    ],
  },
  {
    id: 'catalog',
    label: 'Каталог',
    items: [
      { href: '/admin/catalog/products', label: 'Товары', permission: 'CATALOG_READ' },
      {
        href: '/admin/catalog/flower-structure',
        label: 'Цветы',
        permission: 'CATALOG_READ',
        isActive: isDictionaryPath,
      },
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
        href: '/admin/catalog/pages',
        label: 'Страницы каталога',
        permission: 'CATALOG_READ',
        isActive: (pathname) =>
          pathname === '/admin/catalog/pages' ||
          pathname.startsWith('/admin/catalog/pages/') ||
          pathname === '/admin/seo/landings' ||
          pathname.startsWith('/admin/seo/landings/'),
      },
    ],
  },
  {
    id: 'work',
    label: 'Работа',
    items: [{ href: '/admin/orders', label: 'Заказы', permission: 'ORDERS_READ' }],
  },
  {
    id: 'site',
    label: 'Сайт',
    items: [
      {
        href: '/admin/storefront/homepage',
        label: 'Главная страница',
        permission: 'CONTENT_READ',
        isActive: (pathname) =>
          pathname === '/admin/storefront/homepage' ||
          pathname.startsWith('/admin/storefront/homepage/'),
      },
      {
        href: '/admin/storefront/navigation',
        label: 'Меню сайта',
        permission: 'SETTINGS_READ',
        isActive: (pathname) =>
          pathname === '/admin/storefront/navigation' ||
          pathname.startsWith('/admin/storefront/navigation/'),
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
    ],
  },
  {
    id: 'admin',
    label: 'Администрирование',
    items: [
      { href: '/admin/users', label: 'Пользователи', permission: 'USERS_READ' },
      {
        href: '/admin/legal',
        label: 'Юридическая информация',
        permission: 'LEGAL_READ',
        isActive: (pathname) =>
          pathname === '/admin/legal' || pathname.startsWith('/admin/legal/'),
      },
    ],
  },
  {
    id: 'system',
    label: 'Система и диагностика',
    tier: 'system',
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

/**
 * Centralized admin permission vocabulary.
 * Deny by default — missing permission never grants access.
 */

export const PERMISSIONS = [
  'ADMIN_ACCESS',
  'USERS_READ',
  'USERS_CREATE',
  'USERS_UPDATE',
  'USERS_DISABLE',
  'USERS_RESET_PASSWORD',
  'AUDIT_READ',
  'SETTINGS_READ',
  'SETTINGS_UPDATE',
  'CATALOG_READ',
  'CATALOG_CREATE',
  'CATALOG_UPDATE',
  'CATALOG_PUBLISH',
  'SEO_READ',
  'SEO_UPDATE',
  'SEO_PUBLISH',
  'ORDERS_READ',
  'ORDERS_UPDATE',
  'DELIVERY_READ',
  'DELIVERY_UPDATE',
  'CONTENT_READ',
  'CONTENT_UPDATE',
  'CONTENT_PUBLISH',
  'SITE_HEALTH_READ',
  'LEGAL_READ',
  'LEGAL_EDIT',
  'LEGAL_PUBLISH',
  'INTEGRATION_READ',
  'INTEGRATION_OPERATE',
  'INTEGRATION_CONFIGURE',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ADMIN_ROLES = ['SUPER_ADMIN', 'MANAGER', 'CONTENT_MANAGER'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

const MANAGER_PERMISSIONS: readonly Permission[] = [
  'ADMIN_ACCESS',
  'USERS_READ',
  'AUDIT_READ',
  'SETTINGS_READ',
  'SETTINGS_UPDATE',
  'CATALOG_READ',
  'CATALOG_CREATE',
  'CATALOG_UPDATE',
  'CATALOG_PUBLISH',
  'SEO_READ',
  'ORDERS_READ',
  'ORDERS_UPDATE',
  'DELIVERY_READ',
  'DELIVERY_UPDATE',
  'CONTENT_READ',
  'CONTENT_UPDATE',
  'SITE_HEALTH_READ',
  'LEGAL_READ',
  'INTEGRATION_READ',
];

const CONTENT_MANAGER_PERMISSIONS: readonly Permission[] = [
  'ADMIN_ACCESS',
  'CATALOG_READ',
  'CATALOG_CREATE',
  'CATALOG_UPDATE',
  'CATALOG_PUBLISH',
  'SEO_READ',
  'SEO_UPDATE',
  'SEO_PUBLISH',
  'CONTENT_READ',
  'CONTENT_UPDATE',
  'CONTENT_PUBLISH',
  'LEGAL_READ',
  'LEGAL_EDIT',
];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  CONTENT_MANAGER: CONTENT_MANAGER_PERMISSIONS,
};

export function permissionsForRole(role: AdminRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** AND semantics: every listed permission must be present. */
export function roleHasAllPermissions(role: AdminRole, required: readonly Permission[]): boolean {
  const granted = ROLE_PERMISSIONS[role];
  return required.every((permission) => granted.includes(permission));
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

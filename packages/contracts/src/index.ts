/**
 * Shared API contracts consumed by Next.js, Expo, and integrations.
 * Keep this package free of runtime framework dependencies and Prisma types.
 */

export type HealthStatus = 'ok' | 'degraded' | 'error';

export type HealthCheckResult = {
  status: HealthStatus;
  detail?: string;
};

export type HealthResponse = {
  status: HealthStatus;
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  requestId?: string;
  checks: {
    application: HealthCheckResult;
    database?: HealthCheckResult;
    erp?: HealthCheckResult;
    storage?: HealthCheckResult;
    outbox?: HealthCheckResult;
  };
};

export const API_V1_PREFIX = '/api/v1' as const;

export const ADMIN_SESSION_COOKIE = 'bouquet_admin_session' as const;

export type {
  AdminRole,
  AdminUserStatus,
  Permission,
} from './permissions';

export {
  ADMIN_ROLES,
  ADMIN_USER_STATUSES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  isAdminRole,
  isPermission,
  permissionsForRole,
  roleHasAllPermissions,
  roleHasPermission,
} from './permissions';

export type AdminUserPublic = {
  id: string;
  email: string;
  displayName: string;
  role: import('./permissions').AdminRole;
  status: import('./permissions').AdminUserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  permissions: import('./permissions').Permission[];
};

export type AuthMeResponse = {
  user: AdminUserPublic;
  session: {
    id: string;
    expiresAt: string;
    absoluteExpiresAt: string;
  };
};

export type AdminUserListResponse = {
  items: AdminUserPublic[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuditLogPublic = {
  id: string;
  actorAdminUserId: string | null;
  actorEmail: string | null;
  actorDisplayName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
};

export type AuditLogListResponse = {
  items: AuditLogPublic[];
  total: number;
  page: number;
  pageSize: number;
};

export type ApiErrorBody = {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  path: string;
  timestamp: string;
};

export * from './catalog';
export * from './storefront';
export * from './orders';

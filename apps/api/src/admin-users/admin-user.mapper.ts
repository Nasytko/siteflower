import { permissionsForRole, type AdminUserPublic } from '@bouquet-one/contracts';

export function toAdminUserPublic(user: {
  id: string;
  email: string;
  displayName: string;
  role: AdminUserPublic['role'];
  status: AdminUserPublic['status'];
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}): AdminUserPublic {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    permissions: [...permissionsForRole(user.role)],
  };
}

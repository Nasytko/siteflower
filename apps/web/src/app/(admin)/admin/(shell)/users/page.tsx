import { roleHasPermission } from '@bouquet-one/contracts';
import type { AdminUserListResponse } from '@bouquet-one/contracts';
import { adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { UsersManager } from '@/components/admin/users-manager';

export default async function AdminUsersPage() {
  const me = await fetchAdminMe();
  if (!me || !roleHasPermission(me.user.role, 'USERS_READ')) {
    return (
      <main>
        <h1 className="text-2xl font-semibold">Пользователи</h1>
        <p className="mt-2 text-stone-600">Недостаточно прав.</p>
      </main>
    );
  }

  const data = await adminFetch<AdminUserListResponse>('/api/v1/admin/users?page=1&pageSize=50');

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Пользователи</h1>
        <p className="admin-page-lead">Управление администраторами магазина</p>
      </header>
      <UsersManager
        initial={data}
        permissions={{
          create: roleHasPermission(me.user.role, 'USERS_CREATE'),
          update: roleHasPermission(me.user.role, 'USERS_UPDATE'),
          disable: roleHasPermission(me.user.role, 'USERS_DISABLE'),
          resetPassword: roleHasPermission(me.user.role, 'USERS_RESET_PASSWORD'),
        }}
        currentUserId={me.user.id}
      />
    </main>
  );
}

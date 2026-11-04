import { roleHasPermission } from '@bouquet-one/contracts';
import type { AdminUserListResponse } from '@bouquet-one/contracts';
import { adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { UsersManager } from '@/components/admin/users-manager';

export default async function AdminUsersPage() {
  const me = await fetchAdminMe();
  if (!me || !roleHasPermission(me.user.role, 'USERS_READ')) {
    return (
      <main id="main-content" className="space-y-2">
        <AdminPageHeader title="Пользователи" lead="Недостаточно прав." />
      </main>
    );
  }

  const data = await adminFetch<AdminUserListResponse>('/api/v1/admin/users?page=1&pageSize=50');

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Пользователи"
        lead="Кто может входить в панель. Роли задают доступ к товарам, заказам и системе."
      />
      <p className="admin-notice">
        Не отключайте собственный аккаунт. Сброс пароля сразу разлогинивает пользователя.
      </p>
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

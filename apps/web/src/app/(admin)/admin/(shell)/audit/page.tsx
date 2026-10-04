import { roleHasPermission, type AuditLogListResponse } from '@bouquet-one/contracts';
import { adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { AuditViewer } from '@/components/admin/audit-viewer';

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; actorAdminUserId?: string }>;
}) {
  const me = await fetchAdminMe();
  if (!me || !roleHasPermission(me.user.role, 'AUDIT_READ')) {
    return (
      <main id="main-content" className="space-y-2">
        <h1 className="admin-page-title">Журнал действий</h1>
        <p className="admin-page-lead">Недостаточно прав для просмотра журнала.</p>
      </main>
    );
  }

  const params = await searchParams;
  const query = new URLSearchParams({ page: '1', pageSize: '50' });
  if (params.action) query.set('action', params.action);
  if (params.actorAdminUserId) query.set('actorAdminUserId', params.actorAdminUserId);

  const data = await adminFetch<AuditLogListResponse>(`/api/v1/admin/audit?${query.toString()}`);

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Журнал действий</h1>
        <p className="admin-page-lead">Кто и что менял в панели магазина</p>
      </header>
      <AuditViewer initial={data} currentAction={params.action} />
    </main>
  );
}

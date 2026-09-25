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
      <main>
        <h1 className="text-2xl font-semibold">Аудит</h1>
        <p className="mt-2 text-stone-600">Недостаточно прав.</p>
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
        <h1 className="admin-page-title">Аудит</h1>
        <p className="admin-page-lead">Журнал административных действий</p>
      </header>
      <AuditViewer initial={data} currentAction={params.action} />
    </main>
  );
}

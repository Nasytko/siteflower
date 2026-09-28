import { roleHasPermission } from '@bouquet-one/contracts';
import { IntegrationActions } from '@/components/admin/integration-actions';
import { IntegrationEventsTable } from '@/components/admin/integration-events-table';
import { IntegrationStatusCards } from '@/components/admin/integration-status-cards';
import {
  fetchIntegrationEvents,
  fetchIntegrationStatus,
} from '@/lib/admin-integration-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminIntegrationErpPage() {
  const me = await requireAdminPermission('INTEGRATION_READ');
  const [status, events] = await Promise.all([
    fetchIntegrationStatus(),
    fetchIntegrationEvents({ page: 1, pageSize: 30 }),
  ]);

  const canOperate = roleHasPermission(me.user.role, 'INTEGRATION_OPERATE');
  const canConfigure = roleHasPermission(me.user.role, 'INTEGRATION_CONFIGURE');

  return (
    <main id="main-content" className="space-y-8">
      <header>
        <h1 className="admin-page-title">ERP-интеграция</h1>
        <p className="admin-page-lead">
          Исходящая доставка заказов в NewERP: статус воркера, очередь outbox и операционные
          действия.
        </p>
      </header>

      <IntegrationStatusCards status={status} />

      <IntegrationActions
        status={status}
        canOperate={canOperate}
        canConfigure={canConfigure}
      />

      <section className="admin-section">
        <h2 className="admin-section__title">События outbox</h2>
        <p className="admin-section__lead">
          Телефоны и секреты не показываются. Ошибки — только санитизированные сообщения.
        </p>
        <div className="admin-card">
          <IntegrationEventsTable
            items={events.items}
            total={events.total}
            canOperate={canOperate}
          />
        </div>
      </section>
    </main>
  );
}

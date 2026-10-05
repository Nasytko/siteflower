import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchProductsPage } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { CompositionSetupManager } from '@/components/admin/composition-setup-manager';

export default async function AdminCompositionSetupPage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const data = await fetchProductsPage({
    needsCompositionMigration: true,
    page: 1,
    pageSize: 50,
    sort: 'newest',
  });

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Миграция состава"
        lead="Разовый инструмент: перевести товары со старых полей цветка на состав из справочника «Цветы». Не часть ежедневной работы. Поиск цветка — server-side."
      />
      <CompositionSetupManager
        initial={data}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

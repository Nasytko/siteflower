import { roleHasPermission } from '@bouquet-one/contracts';
import {
  fetchCatalogStructurePickers,
  fetchProductsPage,
} from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { CompositionSetupManager } from '@/components/admin/composition-setup-manager';

export default async function AdminCompositionSetupPage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const [data, structure] = await Promise.all([
    fetchProductsPage({
      needsCompositionMigration: true,
      page: 1,
      pageSize: 50,
      sort: 'newest',
    }),
    fetchCatalogStructurePickers(),
  ]);

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Миграция состава"
        lead="Разовый инструмент: перевести товары со старых полей цветка на состав из справочника «Цветы». Не часть ежедневной работы."
      />
      <CompositionSetupManager
        initial={data}
        flowerItems={structure.flowerItems}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

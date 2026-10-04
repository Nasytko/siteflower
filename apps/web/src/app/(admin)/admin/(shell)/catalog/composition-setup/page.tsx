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
        title="Требуют настройки состава"
        lead="Перевод старых товаров на FlowerItem вручную. Без автоматического угадывания высоты и происхождения."
      />
      <CompositionSetupManager
        initial={data}
        flowerItems={structure.flowerItems}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

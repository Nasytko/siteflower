import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchCatalogStructurePickers } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { FlowerStructureManager } from '@/components/admin/flower-structure-manager';

export default async function AdminFlowerStructurePage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const { flowerTypes, flowerVarieties, flowerOrigins } = await fetchCatalogStructurePickers();

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Виды цветов"
        lead="Справочник вида, сорта и происхождения для коммерческих названий и фильтров."
      />
      <FlowerStructureManager
        initialTypes={flowerTypes}
        initialVarieties={flowerVarieties}
        initialOrigins={flowerOrigins}
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
      />
    </main>
  );
}

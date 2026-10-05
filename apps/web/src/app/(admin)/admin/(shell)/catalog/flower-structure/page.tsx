import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchCatalogStructurePickers } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { FlowerStructureManager } from '@/components/admin/flower-structure-manager';

export default async function AdminFlowerStructurePage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const { flowerTypes, flowerVarieties, flowerOrigins, flowerItems } =
    await fetchCatalogStructurePickers();

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Цветы"
        lead="Конкретные позиции для состава: вид, форма, сорт, происхождение и высота стебля. Количество задаётся в составе товара."
      />
      <FlowerStructureManager
        initialTypes={flowerTypes}
        initialVarieties={flowerVarieties}
        initialOrigins={flowerOrigins}
        initialItems={flowerItems}
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

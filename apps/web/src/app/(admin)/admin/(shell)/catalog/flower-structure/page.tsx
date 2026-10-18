import { roleHasPermission } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { FlowerStructureManager } from '@/components/admin/flower-structure-manager';
import { TaxonomyKindTabs } from '@/components/admin/taxonomy-kind-tabs';
import {
  fetchCatalogStructurePickers,
  fetchFlowerItemsPage,
} from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminFlowerStructurePage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const [{ flowerTypes, flowerVarieties, flowerOrigins, flowerForms }, initialPage] =
    await Promise.all([
      fetchCatalogStructurePickers(),
      fetchFlowerItemsPage({ includeHidden: true, page: 1, pageSize: 50 }),
    ]);

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Цветы"
        lead="Конкретные позиции для состава букетов. Выберите вид, форму, сорт, происхождение и высоту стебля — название соберётся само."
      />
      <TaxonomyKindTabs />
      <FlowerStructureManager
        initialTypes={flowerTypes}
        initialVarieties={flowerVarieties}
        initialOrigins={flowerOrigins}
        initialForms={flowerForms}
        initialPage={initialPage}
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

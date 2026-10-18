import { roleHasPermission } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { CatalogCategoriesManager } from '@/components/admin/catalog-categories-manager';
import { TaxonomyKindTabs } from '@/components/admin/taxonomy-kind-tabs';
import { fetchCatalogStructurePickers } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminCatalogCategoriesPage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const { categories } = await fetchCatalogStructurePickers();

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Категории"
        lead="Дерево каталога: структура, количество товаров, скрытие и безопасное удаление с переносом."
      />
      <TaxonomyKindTabs />
      <CatalogCategoriesManager
        initial={categories}
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchCatalogStructurePickers } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { CatalogCategoriesManager } from '@/components/admin/catalog-categories-manager';

export default async function AdminCatalogCategoriesPage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const { categories } = await fetchCatalogStructurePickers();

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Категории"
        lead="Дерево каталога: структура, количество товаров, скрытие и безопасное удаление с переносом."
      />
      <CatalogCategoriesManager
        initial={categories}
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

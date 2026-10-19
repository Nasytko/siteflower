import { roleHasPermission } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { CatalogPagesManager } from '@/components/admin/catalog-pages-manager';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminCatalogPagesPage() {
  const me = await requireAdminPermission('CATALOG_READ');

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Страницы каталога"
        lead="Основные разделы и тематические подборки в одном месте. Товары попадают сюда автоматически по типу и правилам состава."
      />
      <CatalogPagesManager
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
        canPublish={roleHasPermission(me.user.role, 'CATALOG_PUBLISH')}
      />
    </main>
  );
}

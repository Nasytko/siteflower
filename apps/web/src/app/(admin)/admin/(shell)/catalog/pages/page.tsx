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
        lead="Основные разделы заполняются сами по типу товара. Тематические страницы — по правилам состава (например «с розами» или «из роз»). Черновики на сайте не видны."
      />
      <CatalogPagesManager
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
        canPublish={roleHasPermission(me.user.role, 'CATALOG_PUBLISH')}
      />
    </main>
  );
}

import { roleHasPermission } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { PackagingAddonsManager } from '@/components/admin/packaging-addons-manager';
import { TaxonomyKindTabs } from '@/components/admin/taxonomy-kind-tabs';
import { fetchPackagingAddons } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminPackagingDictionaryPage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const items = await fetchPackagingAddons(true);

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Лента и упаковка"
        lead="Общий справочник доплат: название, цена и артикул ERP. В карточке товара только выбираете из списка."
      />
      <p className="admin-notice">
        1) Заведите позиции здесь → 2) В товаре откройте «Лента и упаковка» и выберите нужные → 3)
        Сохраните товар.
      </p>
      <TaxonomyKindTabs />
      <PackagingAddonsManager
        initialItems={items}
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchBestsellerGroups } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { BestsellersManager } from '@/components/admin/bestsellers-manager';

export default async function AdminBestsellersPage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const groups = await fetchBestsellerGroups();

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Бестселлеры</h1>
        <p className="admin-page-lead">Подборки товаров для главной страницы — вручную, без правил</p>
      </header>
      <BestsellersManager
        initial={groups}
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

import Link from 'next/link';
import { roleHasPermission } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { BestsellersManager } from '@/components/admin/bestsellers-manager';
import { fetchBestsellerGroups } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminBestsellersPage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const groups = await fetchBestsellerGroups();

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Подборки"
        lead="Товары на главной и в маркетинговых блоках. Это не связанные товары в карточке."
        actions={
          <Link href="/admin/promotions" className="admin-btn-ghost">
            Акции
          </Link>
        }
      />
      <BestsellersManager
        initial={groups}
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

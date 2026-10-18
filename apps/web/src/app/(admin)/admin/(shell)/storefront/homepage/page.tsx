import { roleHasPermission, type HomepageConfigAdminDto } from '@bouquet-one/contracts';
import { DiscoveryTilesEditor } from '@/components/admin/discovery-tiles-editor';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminHomepageDiscoveryPage() {
  const me = await requireAdminPermission('CONTENT_READ');
  const initial = await adminFetch<HomepageConfigAdminDto>(adminEndpoints.homepage);

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Плитки на главной</h1>
        <p className="admin-page-lead">
          Категории под героем: можно переименовать, сменить фото и ссылку.
        </p>
      </header>
      <DiscoveryTilesEditor
        initial={initial}
        canUpdate={roleHasPermission(me.user.role, 'CONTENT_UPDATE')}
      />
    </main>
  );
}

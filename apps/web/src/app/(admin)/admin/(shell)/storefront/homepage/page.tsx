import Link from 'next/link';
import { roleHasPermission, type HomepageConfigAdminDto } from '@bouquet-one/contracts';
import { DiscoveryTilesEditor } from '@/components/admin/discovery-tiles-editor';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminHomepageDiscoveryPage() {
  const me = await requireAdminPermission('CONTENT_READ');
  const initial = await adminFetch<HomepageConfigAdminDto>(adminEndpoints.homepage);
  const canReadNavigation = roleHasPermission(me.user.role, 'SETTINGS_READ');

  return (
    <main id="main-content" className="space-y-6">
      <header className="admin-page-header">
        <div className="admin-page-header__text">
          <h1 className="admin-page-title">Главная и меню</h1>
          <p className="admin-page-lead">
            Категории под героем: можно переименовать, сменить фото и ссылку.
          </p>
        </div>
        <div className="admin-page-header__actions flex flex-wrap gap-2">
          {canReadNavigation ? (
            <Link href="/admin/storefront/navigation" className="admin-btn-ghost">
              Меню сайта
            </Link>
          ) : null}
          <Link href="/admin/storefront/instagram" className="admin-btn-ghost">
            Лента Instagram
          </Link>
        </div>
      </header>
      <DiscoveryTilesEditor
        initial={initial}
        canUpdate={roleHasPermission(me.user.role, 'CONTENT_UPDATE')}
      />
    </main>
  );
}

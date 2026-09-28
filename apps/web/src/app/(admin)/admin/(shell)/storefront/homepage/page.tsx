import { roleHasPermission, type HomepageConfigAdminDto } from '@bouquet-one/contracts';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { HomepageEditor } from '@/components/admin/homepage-editor';

export default async function AdminHomepageConfigPage() {
  const me = await requireAdminPermission('CONTENT_READ');
  const initial = await adminFetch<HomepageConfigAdminDto>(adminEndpoints.homepage);

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Главная</h1>
        <p className="admin-page-lead">Первый экран и порядок блоков на главной странице витрины</p>
      </header>
      <HomepageEditor
        initial={initial}
        canUpdate={roleHasPermission(me.user.role, 'CONTENT_UPDATE')}
      />
    </main>
  );
}

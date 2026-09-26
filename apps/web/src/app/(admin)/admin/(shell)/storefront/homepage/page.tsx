import { roleHasPermission, type HomepageConfigAdminDto } from '@bouquet-one/contracts';
import { adminFetch } from '@/lib/admin-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { HomepageEditor } from '@/components/admin/homepage-editor';

export default async function AdminHomepageConfigPage() {
  const me = await requireAdminPermission('CONTENT_READ');
  const initial = await adminFetch<HomepageConfigAdminDto>('/api/v1/admin/storefront/homepage');

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Главная витрины</h1>
        <p className="admin-page-lead">Hero и секции homepage</p>
      </header>
      <HomepageEditor
        initial={initial}
        canUpdate={Boolean(me && roleHasPermission(me.user.role, 'CONTENT_UPDATE'))}
      />
    </main>
  );
}

import { roleHasPermission, type HomepageConfigAdminDto } from '@bouquet-one/contracts';
import { adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { HomepageEditor } from '@/components/admin/homepage-editor';

export default async function AdminHomepageConfigPage() {
  const me = await fetchAdminMe();
  const initial = await adminFetch<HomepageConfigAdminDto>('/api/v1/admin/storefront/homepage');

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-stone-900">Главная витрины</h1>
        <p className="text-stone-600">Hero и секции homepage (constrained CMS)</p>
      </header>
      <HomepageEditor
        initial={initial}
        canUpdate={Boolean(me && roleHasPermission(me.user.role, 'CONTENT_UPDATE'))}
      />
    </main>
  );
}

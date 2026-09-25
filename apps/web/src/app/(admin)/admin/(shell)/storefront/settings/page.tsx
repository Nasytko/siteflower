import { roleHasPermission, type StorefrontSettingsAdminDto } from '@bouquet-one/contracts';
import { adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { StorefrontSettingsEditor } from '@/components/admin/storefront-settings-editor';

export default async function AdminStorefrontSettingsPage() {
  const me = await fetchAdminMe();
  const initial = await adminFetch<StorefrontSettingsAdminDto>(
    '/api/v1/admin/storefront/settings',
  );

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Настройки витрины</h1>
        <p className="admin-page-lead">Контакты, доставка и публичные тексты магазина</p>
      </header>
      <StorefrontSettingsEditor
        initial={initial}
        canUpdate={Boolean(me && roleHasPermission(me.user.role, 'SETTINGS_UPDATE'))}
      />
    </main>
  );
}

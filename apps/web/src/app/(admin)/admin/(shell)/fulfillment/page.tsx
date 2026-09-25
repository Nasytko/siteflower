import { roleHasPermission, type FulfillmentSettingsAdminDto } from '@bouquet-one/contracts';
import { redirect } from 'next/navigation';
import { adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { FulfillmentSettingsEditor } from '@/components/admin/fulfillment-settings-editor';

export default async function AdminFulfillmentPage() {
  const me = await fetchAdminMe();
  if (!me || !roleHasPermission(me.user.role, 'SETTINGS_READ')) {
    redirect('/admin');
  }

  const initial = await adminFetch<FulfillmentSettingsAdminDto>(
    '/api/v1/admin/fulfillment/settings',
  );

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Доставка и самовывоз</h1>
        <p className="admin-page-lead">
          Окна времени, lead time и методы получения (Europe/Minsk)
        </p>
      </header>
      <FulfillmentSettingsEditor
        initial={initial}
        canUpdate={roleHasPermission(me.user.role, 'SETTINGS_UPDATE')}
      />
    </main>
  );
}

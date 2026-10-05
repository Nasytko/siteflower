import { roleHasPermission, type NavigationMenuAdminDto } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { NavigationMenuManager } from '@/components/admin/navigation-menu-manager';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function StorefrontNavigationPage() {
  const me = await requireAdminPermission('SETTINGS_READ');
  const menu = await adminFetch<NavigationMenuAdminDto>(adminEndpoints.navigationMain);

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Главное меню"
        lead="Управляйте навигацией магазина отдельно от категорий каталога. Пункт «Акции» не требует категории."
      />
      <NavigationMenuManager
        initial={menu}
        canUpdate={roleHasPermission(me.user.role, 'SETTINGS_UPDATE')}
      />
    </main>
  );
}

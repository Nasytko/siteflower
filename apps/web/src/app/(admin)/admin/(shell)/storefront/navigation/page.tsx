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
        title="Навигация"
        lead="Редактор главного меню витрины: пункты, колонки, иконки и ссылки. Служебные страницы (О нас, Доставка) живут в верхней строке сайта."
      />
      <NavigationMenuManager
        initial={menu}
        canUpdate={roleHasPermission(me.user.role, 'SETTINGS_UPDATE')}
      />
    </main>
  );
}

import Link from 'next/link';
import { roleHasPermission, type HomepageConfigAdminDto } from '@bouquet-one/contracts';
import { HomepageManager } from '@/components/admin/homepage-manager';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminHomepagePage() {
  const me = await requireAdminPermission('CONTENT_READ');
  const initial = await adminFetch<HomepageConfigAdminDto>(adminEndpoints.homepage);
  const canReadNavigation = roleHasPermission(me.user.role, 'SETTINGS_READ');

  return (
    <main id="main-content" className="space-y-6">
      <header className="admin-page-header">
        <div className="admin-page-header__text">
          <h1 className="admin-page-title">Главная страница</h1>
          <p className="admin-page-lead">
            Баннеры, быстрые категории, товарные секции и преимущества. Меню сайта и настройки
            магазина — в соседних разделах.
          </p>
        </div>
        <div className="admin-page-header__actions flex flex-wrap gap-2">
          {canReadNavigation ? (
            <Link href="/admin/storefront/navigation" className="admin-btn-ghost">
              Меню сайта
            </Link>
          ) : null}
          <Link href="/admin/storefront/settings" className="admin-btn-ghost">
            Настройки магазина
          </Link>
          <Link href="/admin/promotions" className="admin-btn-ghost">
            Акции
          </Link>
        </div>
      </header>
      <HomepageManager
        initial={initial}
        canUpdate={roleHasPermission(me.user.role, 'CONTENT_UPDATE')}
      />
    </main>
  );
}

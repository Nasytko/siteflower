import Link from 'next/link';
import { roleHasPermission } from '@bouquet-one/contracts';
import { PromotionsManager } from '@/components/admin/promotions-manager';
import { fetchPromotionRows } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminPromotionsPage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const rows = await fetchPromotionRows();

  return (
    <main id="main-content" className="space-y-6">
      <header className="admin-page-header">
        <div className="admin-page-header__text">
          <h1 className="admin-page-title">Акции</h1>
          <p className="admin-page-lead">
            Скидки и сроки по существующим товарам. Подборки главной страницы — отдельно.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link href="/admin/bestsellers" className="admin-btn-ghost">
            Подборки
          </Link>
          <Link href="/admin/catalog/products" className="admin-btn-ghost">
            К товарам
          </Link>
        </div>
      </header>
      <PromotionsManager
        initial={rows}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

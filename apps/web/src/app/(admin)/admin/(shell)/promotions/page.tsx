import Link from 'next/link';
import { roleHasPermission } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { PromotionsManager } from '@/components/admin/promotions-manager';
import { fetchPromotionRows } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminPromotionsPage() {
  const me = await requireAdminPermission('CATALOG_READ');
  const rows = await fetchPromotionRows();

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Акции"
        lead="Скидки и сроки по существующим товарам. Подборки главной страницы — отдельно."
        actions={
          <>
            <Link href="/admin/bestsellers" className="admin-btn-ghost">
              Подборки
            </Link>
            <Link href="/admin/catalog/products" className="admin-btn-ghost">
              К товарам
            </Link>
          </>
        }
      />
      <p className="admin-notice">
        Скидку задавайте здесь, не в карточке товара. Фиксированная цена — по каждому размеру
        отдельно. Даты действуют по местному времени магазина.
      </p>
      <PromotionsManager
        initial={rows}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

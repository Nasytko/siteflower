import Link from 'next/link';
import { fetchPromotionRows } from '@/lib/admin-catalog-api';
import {
  promotionDiscountLabel,
  promotionPeriodLabel,
  promotionRegularPriceLabel,
  promotionSalePriceLabel,
  promotionStatusView,
  promotionTypeForRow,
} from '@/lib/admin-promotions';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { toSameOriginMediaUrl } from '@/lib/media';

export default async function AdminPromotionsPage() {
  await requireAdminPermission('CATALOG_READ');
  const rows = await fetchPromotionRows();

  return (
    <main id="main-content" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="admin-page-title">Акции</h1>
          <p className="admin-page-lead">
            Обзор скидок по товарам. Создать или изменить акцию можно в карточке товара —
            раздел «Акция и витрины».
          </p>
        </div>
        <Link href="/admin/catalog/products" className="admin-btn-ghost">
          К товарам
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="admin-panel space-y-3 py-10 text-center">
          <p className="admin-empty text-base font-medium text-[var(--admin-ink)]">
            Акций пока нет
          </p>
          <p className="mx-auto max-w-md text-sm text-[var(--admin-muted)]">
            Создайте первую акцию, чтобы управлять скидками на товары: откройте товар и включите
            скидку в разделе «Акция и витрины».
          </p>
          <div className="pt-2">
            <Link
              href="/admin/catalog/products"
              className="inline-flex rounded-lg bg-[var(--admin-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Открыть каталог товаров
            </Link>
          </div>
        </div>
      ) : (
        <div className="admin-panel overflow-x-auto">
          <table className="admin-table min-w-[900px]">
            <thead>
              <tr>
                <th className="w-16">Фото</th>
                <th>Товар</th>
                <th className="w-36">Обычная цена</th>
                <th className="w-36">Цена по акции</th>
                <th className="w-28">Скидка</th>
                <th className="w-64">Период</th>
                <th className="w-36">Состояние</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = promotionStatusView(row);
                const discount = promotionDiscountLabel(row);
                return (
                  <tr key={row.id}>
                    <td>
                      {row.primaryImageUrl ? (
                        <img
                          src={toSameOriginMediaUrl(row.primaryImageUrl) ?? row.primaryImageUrl}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="admin-thumb-empty" />
                      )}
                    </td>
                    <td>
                      <Link
                        href={`/admin/catalog/products/${row.id}`}
                        className="font-semibold text-[var(--admin-ink)] underline-offset-2 hover:text-[var(--admin-brand)] hover:underline"
                      >
                        {row.name}
                      </Link>
                      <p className="text-xs text-[var(--admin-muted)]">{promotionTypeForRow(row)}</p>
                    </td>
                    <td className="tabular-nums admin-price-old">
                      {promotionRegularPriceLabel(row)}
                    </td>
                    <td className="tabular-nums">
                      <span className="admin-price-sale">{promotionSalePriceLabel(row)}</span>
                    </td>
                    <td>
                      {discount ? (
                        <span className="admin-chip admin-chip--sale">{discount}</span>
                      ) : (
                        <span className="text-[var(--admin-muted)]">—</span>
                      )}
                    </td>
                    <td className="text-[var(--admin-muted)]">{promotionPeriodLabel(row)}</td>
                    <td>
                      <span
                        className={`admin-chip ${
                          status.tone === 'active'
                            ? 'admin-chip--sale'
                            : status.tone === 'off'
                              ? 'admin-chip--muted'
                              : ''
                        }`}
                      >
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

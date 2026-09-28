import Link from 'next/link';
import { fetchPromotionRows, type PromotionListItemDto } from '@/lib/admin-catalog-api';
import { formatAdminDateTime, promotionTypeLabel } from '@/lib/admin-labels';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { toSameOriginMediaUrl } from '@/lib/media';

type PromotionStatus = { label: string; tone: 'active' | 'planned' | 'ended' | 'off' };

function readStatus(row: PromotionListItemDto): PromotionStatus {
  const admin = row.promotionAdmin;
  if (admin && !admin.enabled) return { label: 'Выключена', tone: 'off' };
  if (admin?.currentlyEffective || (!admin && row.promotion)) {
    return { label: 'Идёт сейчас', tone: 'active' };
  }
  if (admin?.startsAt && new Date(admin.startsAt).getTime() > Date.now()) {
    return { label: 'Запланирована', tone: 'planned' };
  }
  if (admin?.endsAt && new Date(admin.endsAt).getTime() < Date.now()) {
    return { label: 'Завершена', tone: 'ended' };
  }
  return { label: 'Настроена', tone: 'planned' };
}

function readPeriod(row: PromotionListItemDto): string {
  const admin = row.promotionAdmin;
  if (!admin || (!admin.startsAt && !admin.endsAt)) return 'Без срока';
  const from = admin.startsAt ? formatAdminDateTime(admin.startsAt) : 'сразу';
  const to = admin.endsAt ? formatAdminDateTime(admin.endsAt) : 'бессрочно';
  return `${from} — ${to}`;
}

export default async function AdminPromotionsPage() {
  await requireAdminPermission('CATALOG_READ');
  const rows = await fetchPromotionRows();

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Акции</h1>
        <p className="admin-page-lead">
          Обзор скидок. Редактирование — в карточке товара, раздел «Акция и витрины».
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="admin-panel">
          <p className="admin-empty">
            Акций нет. Откройте товар → «Акция и витрины» и включите скидку.
          </p>
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
                const status = readStatus(row);
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
                      <p className="text-xs text-[var(--admin-muted)]">
                        {row.promotionAdmin
                          ? promotionTypeLabel(row.promotionAdmin.type)
                          : row.promotion
                            ? promotionTypeLabel(row.promotion.type)
                            : '—'}
                      </p>
                    </td>
                    <td className="tabular-nums admin-price-old">
                      {row.promotion?.originalPrice.label ?? row.price?.label ?? '—'}
                    </td>
                    <td className="tabular-nums">
                      <span className="admin-price-sale">
                        {row.promotion?.salePrice.label ?? '—'}
                      </span>
                    </td>
                    <td>
                      {row.promotion?.percentOff ? (
                        <span className="admin-chip admin-chip--sale">
                          −{row.promotion.percentOff}%
                        </span>
                      ) : row.promotionAdmin?.percentOff ? (
                        <span className="admin-chip admin-chip--sale">
                          −{row.promotionAdmin.percentOff}%
                        </span>
                      ) : (
                        <span className="text-[var(--admin-muted)]">—</span>
                      )}
                    </td>
                    <td className="text-[var(--admin-muted)]">{readPeriod(row)}</td>
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

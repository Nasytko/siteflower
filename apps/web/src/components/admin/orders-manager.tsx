'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import {
  orderStatusLabel,
  type FulfillmentType,
  type OrderAdminListItemDto,
  type OrderStatus,
} from '@bouquet-one/contracts';
import { formatPriceFromMinor } from '@/lib/media';

type Props = {
  items: OrderAdminListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    date: string;
    status?: string;
    fulfillmentType?: string;
    q?: string;
  };
};

export function OrdersManager({ items, total, page, pageSize, filters }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || (value === 'all' && key === 'date')) {
      if (key === 'date') params.set('date', 'all');
      else params.delete(key);
    } else if (value === '' || value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('page');
    startTransition(() => {
      router.push(`/admin/orders?${params.toString()}`);
    });
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={`space-y-5 ${pending ? 'opacity-70' : ''}`}>
      <div className="admin-seg">
        {(
          [
            ['today', 'Сегодня'],
            ['tomorrow', 'Завтра'],
            ['all', 'Все'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`admin-seg__btn ${
              (filters.date || 'today') === value ? 'admin-seg__btn--active' : ''
            }`}
            onClick={() => setFilter('date', value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="admin-toolbar">
        <label className="admin-field">
          <span>Статус</span>
          <select
            className="admin-select"
            value={filters.status ?? ''}
            onChange={(e) => setFilter('status', e.target.value)}
          >
            <option value="">Все статусы</option>
            {(
              [
                'RECEIVED',
                'CONFIRMED',
                'PREPARING',
                'READY',
                'DELIVERING',
                'COMPLETED',
                'CANCELLED',
              ] as OrderStatus[]
            ).map((s) => (
              <option key={s} value={s}>
                {orderStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Тип</span>
          <select
            className="admin-select"
            value={filters.fulfillmentType ?? ''}
            onChange={(e) => setFilter('fulfillmentType', e.target.value)}
          >
            <option value="">Все типы</option>
            {(['DELIVERY', 'PICKUP'] as FulfillmentType[]).map((t) => (
              <option key={t} value={t}>
                {t === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}
              </option>
            ))}
          </select>
        </label>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setFilter('q', String(fd.get('q') ?? ''));
          }}
        >
          <label className="admin-field">
            <span>Поиск</span>
            <input
              name="q"
              defaultValue={filters.q ?? ''}
              placeholder="Номер / имя / телефон"
              className="admin-input w-56"
            />
          </label>
          <button type="submit" className="admin-btn-ghost">
            Найти
          </button>
        </form>
      </div>

      <div className="admin-panel overflow-x-auto">
        <table className="admin-table min-w-[720px]">
          <thead>
            <tr>
              <th>Номер</th>
              <th>Дата</th>
              <th>Время</th>
              <th>Тип</th>
              <th>Клиент</th>
              <th>Статус</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <p className="admin-empty">Заказов нет</p>
                </td>
              </tr>
            ) : (
              items.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-semibold text-[var(--admin-ink)] underline-offset-2 hover:text-[var(--admin-brand)] hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="tabular-nums">{order.fulfillmentDate}</td>
                  <td>{order.timeWindowLabel}</td>
                  <td>
                    <span className="admin-chip admin-chip--muted">
                      {order.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}
                    </span>
                  </td>
                  <td>
                    <span className="block">{order.purchaserName}</span>
                    {order.recipientName && order.recipientName !== order.purchaserName ? (
                      <span className="block text-xs text-[var(--admin-muted)]">
                        → {order.recipientName}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span className="admin-chip">{orderStatusLabel(order.status)}</span>
                  </td>
                  <td className="tabular-nums font-semibold">
                    {formatPriceFromMinor(order.totalMinor, order.currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="flex items-center gap-3 text-sm text-[var(--admin-muted)]">
          <span>
            Стр. {page} / {pages} · {total}
          </span>
          {page > 1 ? (
            <Link
              href={`/admin/orders?${new URLSearchParams({
                ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
                page: String(page - 1),
              }).toString()}`}
              className="font-medium text-[var(--admin-brand)] underline-offset-2 hover:underline"
            >
              Назад
            </Link>
          ) : null}
          {page < pages ? (
            <Link
              href={`/admin/orders?${new URLSearchParams({
                ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
                page: String(page + 1),
              }).toString()}`}
              className="font-medium text-[var(--admin-brand)] underline-offset-2 hover:underline"
            >
              Далее
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

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
    if (!value || value === 'all' && key === 'date') {
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
    <div className={`space-y-6 ${pending ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap gap-2">
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
            className={`rounded-md px-3 py-2 text-sm ${
              (filters.date || 'today') === value
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-800'
            }`}
            onClick={() => setFilter('date', value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-md border border-stone-300 px-3 py-2 text-sm"
          value={filters.status ?? ''}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="">Статус</option>
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
        <select
          className="rounded-md border border-stone-300 px-3 py-2 text-sm"
          value={filters.fulfillmentType ?? ''}
          onChange={(e) => setFilter('fulfillmentType', e.target.value)}
        >
          <option value="">Тип</option>
          {(['DELIVERY', 'PICKUP'] as FulfillmentType[]).map((t) => (
            <option key={t} value={t}>
              {t === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}
            </option>
          ))}
        </select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setFilter('q', String(fd.get('q') ?? ''));
          }}
        >
          <input
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="Номер / имя / телефон"
            className="w-56 rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-stone-200 px-3 py-2 text-sm hover:bg-stone-300"
          >
            Найти
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-stone-200 text-stone-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Номер</th>
              <th className="py-2 pr-3 font-medium">Дата</th>
              <th className="py-2 pr-3 font-medium">Время</th>
              <th className="py-2 pr-3 font-medium">Тип</th>
              <th className="py-2 pr-3 font-medium">Клиент</th>
              <th className="py-2 pr-3 font-medium">Статус</th>
              <th className="py-2 pr-3 font-medium">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-stone-500">
                  Заказов нет
                </td>
              </tr>
            ) : (
              items.map((order) => (
                <tr key={order.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="py-3 pr-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-medium text-stone-900 underline-offset-2 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="py-3 pr-3 tabular-nums">{order.fulfillmentDate}</td>
                  <td className="py-3 pr-3">{order.timeWindowLabel}</td>
                  <td className="py-3 pr-3">
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-xs">
                      {order.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <span className="block">{order.purchaserName}</span>
                    {order.recipientName && order.recipientName !== order.purchaserName ? (
                      <span className="block text-xs text-stone-500">
                        → {order.recipientName}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3">{orderStatusLabel(order.status)}</td>
                  <td className="py-3 pr-3 tabular-nums">
                    {formatPriceFromMinor(order.totalMinor, order.currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="flex items-center gap-3 text-sm text-stone-600">
          <span>
            Стр. {page} / {pages} · {total}
          </span>
          {page > 1 ? (
            <Link
              href={`/admin/orders?${new URLSearchParams({
                ...Object.fromEntries(
                  Object.entries(filters).filter(([, v]) => v),
                ),
                page: String(page - 1),
              }).toString()}`}
              className="underline"
            >
              Назад
            </Link>
          ) : null}
          {page < pages ? (
            <Link
              href={`/admin/orders?${new URLSearchParams({
                ...Object.fromEntries(
                  Object.entries(filters).filter(([, v]) => v),
                ),
                page: String(page + 1),
              }).toString()}`}
              className="underline"
            >
              Далее
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  orderStatusLabel,
  type OrderAdminDetailDto,
  type OrderStatus,
  type OutboxEventAdminListItem,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { OrderErpSection } from '@/components/admin/order-erp-section';
import { formatPriceFromMinor, toSameOriginMediaUrl } from '@/lib/media';

type Props = {
  initial: OrderAdminDetailDto;
  canUpdate: boolean;
  erpEvents?: OutboxEventAdminListItem[] | null;
  erpTotal?: number;
  canOperateIntegration?: boolean;
};

const TRANSITION_LABELS: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Подтвердить',
  PREPARING: 'Начать сборку',
  READY: 'Готов',
  DELIVERING: 'Передать в доставку',
  COMPLETED: 'Завершить',
};

async function mutate(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      origin: window.location.origin,
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : `Request failed (${response.status})`,
    );
  }
  return body as OrderAdminDetailDto;
}

export function OrderDetailPanel({
  initial,
  canUpdate,
  erpEvents = null,
  erpTotal = 0,
  canOperateIntegration = false,
}: Props) {
  const router = useRouter();
  const [order, setOrder] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  async function doTransition(toStatus: OrderStatus) {
    if (!canUpdate || pending) return;
    setPending(true);
    setError(null);
    try {
      const updated = await mutate(`/api/v1/admin/orders/${order.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ toStatus }),
      });
      setOrder(updated);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setPending(false);
    }
  }

  async function doCancel() {
    if (!canUpdate || pending || cancelReason.trim().length < 3) return;
    setPending(true);
    setError(null);
    try {
      const updated = await mutate(`/api/v1/admin/orders/${order.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      setOrder(updated);
      setShowCancel(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setPending(false);
    }
  }

  const nextActions = order.allowedTransitions.filter((s) => s !== 'CANCELLED');

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/orders" className="text-sm text-stone-500 hover:underline">
            ← К заказам
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-stone-900">
            Заказ {order.orderNumber}
          </h1>
          <p className="mt-1 text-stone-600">
            {orderStatusLabel(order.status)} · создан{' '}
            {new Date(order.createdAt).toLocaleString('ru-BY')}
          </p>
        </div>
        {canUpdate ? (
          <div className="flex flex-wrap gap-2">
            {nextActions.map((status) => (
              <Button
                key={status}
                type="button"
                disabled={pending}
                onClick={() => void doTransition(status)}
              >
                {TRANSITION_LABELS[status] ?? orderStatusLabel(status)}
              </Button>
            ))}
            {order.allowedTransitions.includes('CANCELLED') ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setShowCancel(true)}
              >
                Отменить
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {showCancel ? (
        <div className="rounded-md border border-stone-200 bg-stone-50 p-4 space-y-3">
          <p className="text-sm font-medium">Причина отмены (внутренняя)</p>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            placeholder="Минимум 3 символа"
          />
          <div className="flex gap-2">
            <Button type="button" disabled={pending} onClick={() => void doCancel()}>
              Подтвердить отмену
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCancel(false)}
            >
              Закрыть
            </Button>
          </div>
        </div>
      ) : null}

      <section className="grid gap-8 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Получение</h2>
          <p>
            {order.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}
          </p>
          <p className="text-sm text-stone-600">
            {order.fulfillmentDate} · {order.timeWindowLabel}
          </p>
          {order.fulfillmentType === 'DELIVERY' ? (
            <>
              <p className="text-sm">
                {order.addressKnown
                  ? order.deliveryAddress
                  : 'Адрес неизвестен (сюрприз / уточнить)'}
              </p>
              {order.addressDetails ? (
                <p className="text-sm text-stone-600">{order.addressDetails}</p>
              ) : null}
            </>
          ) : null}
          {order.surprise ? (
            <p className="text-sm font-medium text-amber-800">Сюрприз</p>
          ) : null}
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Получатель</h2>
            <p>{order.recipientName ?? '—'}</p>
            <p className="text-sm text-stone-600">{order.recipientPhoneE164 ?? '—'}</p>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Заказчик</h2>
            <p>{order.purchaserName}</p>
            <p className="text-sm text-stone-600">{order.purchaserPhoneE164}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Позиции</h2>
        <ul className="divide-y divide-stone-200">
          {order.items.map((item) => {
            const img = toSameOriginMediaUrl(item.primaryImageUrl);
            return (
              <li key={item.id} className="flex gap-4 py-3">
                <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded bg-stone-100">
                  {img ? (
                    <Image src={img} alt="" fill className="object-cover" sizes="56px" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-sm text-stone-600">
                    {item.variantName} · × {item.quantity} ·{' '}
                    {formatPriceFromMinor(item.unitPriceMinor, item.currency)}
                  </p>
                </div>
                <p className="tabular-nums">
                  {formatPriceFromMinor(item.lineTotalMinor, item.currency)}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-stone-200 pt-3 text-sm space-y-1">
          <p className="flex justify-between">
            <span>Товары</span>
            <span className="tabular-nums">
              {formatPriceFromMinor(order.subtotalMinor, order.currency)}
            </span>
          </p>
          <p className="flex justify-between">
            <span>Доставка</span>
            <span className="tabular-nums">
              {formatPriceFromMinor(order.deliveryFeeMinor, order.currency)}
            </span>
          </p>
          <p className="flex justify-between text-base font-semibold">
            <span>Итого</span>
            <span className="tabular-nums">
              {formatPriceFromMinor(order.totalMinor, order.currency)}
            </span>
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Сообщение</h2>
        {order.cardMessage ? (
          <p className="whitespace-pre-wrap text-sm">{order.cardMessage}</p>
        ) : (
          <p className="text-sm text-stone-500">Без открытки</p>
        )}
        {order.anonymousCard ? (
          <p className="text-sm text-stone-600">Не указывать отправителя</p>
        ) : null}
        {order.customerComment ? (
          <p className="text-sm text-stone-600">Комментарий: {order.customerComment}</p>
        ) : null}
        {order.cancellationReason ? (
          <p className="text-sm text-red-700">Отмена: {order.cancellationReason}</p>
        ) : null}
      </section>

      {erpEvents !== null ? (
        <OrderErpSection
          events={erpEvents}
          total={erpTotal}
          canOperate={canOperateIntegration}
        />
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">История</h2>
        <ul className="space-y-2 text-sm">
          {order.events.map((ev) => (
            <li key={ev.id} className="flex flex-wrap gap-x-3 text-stone-700">
              <span className="tabular-nums text-stone-500">
                {new Date(ev.createdAt).toLocaleString('ru-BY')}
              </span>
              <span>{ev.type}</span>
              {ev.fromStatus && ev.toStatus ? (
                <span>
                  {orderStatusLabel(ev.fromStatus)} → {orderStatusLabel(ev.toStatus)}
                </span>
              ) : null}
              {ev.message ? <span className="text-stone-500">{ev.message}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

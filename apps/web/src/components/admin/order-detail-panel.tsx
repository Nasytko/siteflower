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

const EVENT_TYPE_LABELS: Record<string, string> = {
  ORDER_CREATED: 'Заказ создан',
  ORDER_STATUS_CHANGED: 'Статус изменён',
  ORDER_CANCELLED: 'Заказ отменён',
  ORDER_UPDATED: 'Заказ обновлён',
  ORDER_NOTE: 'Комментарий',
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
          : 'Не удалось выполнить действие. Попробуйте ещё раз.',
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
      setError(err instanceof Error ? err.message : 'Не удалось изменить статус');
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
      setError(err instanceof Error ? err.message : 'Не удалось отменить заказ');
    } finally {
      setPending(false);
    }
  }

  const nextActions = order.allowedTransitions.filter((s) => s !== 'CANCELLED');
  const primaryNext = nextActions[0];
  const secondaryNext = nextActions.slice(1);

  return (
    <div className="space-y-8">
      <header className="admin-page-header">
        <div className="admin-page-header__text space-y-2">
          <Link href="/admin/orders" className="admin-link text-sm">
            ← К заказам
          </Link>
          <h1 className="admin-page-title">Заказ {order.orderNumber}</h1>
          <p className="admin-page-lead">
            <span className="admin-chip">{orderStatusLabel(order.status)}</span>
            <span className="ml-2">
              создан {new Date(order.createdAt).toLocaleString('ru-BY')}
            </span>
          </p>
        </div>
        {canUpdate ? (
          <div className="admin-page-header__actions">
            {primaryNext ? (
              <button
                type="button"
                className="admin-btn"
                disabled={pending}
                onClick={() => void doTransition(primaryNext)}
              >
                {TRANSITION_LABELS[primaryNext] ?? orderStatusLabel(primaryNext)}
              </button>
            ) : null}
            {secondaryNext.map((status) => (
              <button
                key={status}
                type="button"
                className="admin-btn-ghost"
                disabled={pending}
                onClick={() => void doTransition(status)}
              >
                {TRANSITION_LABELS[status] ?? orderStatusLabel(status)}
              </button>
            ))}
            {order.allowedTransitions.includes('CANCELLED') ? (
              <button
                type="button"
                className="admin-btn-ghost"
                disabled={pending}
                onClick={() => setShowCancel(true)}
              >
                Отменить
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="admin-error">
          {error}
        </p>
      ) : null}

      {showCancel ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-cancel-title"
          className="admin-panel space-y-3 border border-[var(--admin-brand)]/30 p-4"
        >
          <h2 id="order-cancel-title" className="text-base font-semibold text-[var(--admin-ink)]">
            Отменить заказ?
          </h2>
          <label className="admin-field">
            <span>Причина отмены (внутренняя)</span>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="admin-input"
              placeholder="Минимум 3 символа"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="admin-btn"
              disabled={pending || cancelReason.trim().length < 3}
              onClick={() => void doCancel()}
            >
              Подтвердить отмену
            </button>
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={pending}
              onClick={() => setShowCancel(false)}
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}

      <section className="grid gap-6 md:grid-cols-2">
        <div className="admin-section space-y-2">
          <h2 className="admin-section__title">Получение</h2>
          <p>{order.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}</p>
          <p className="text-sm text-[var(--admin-muted)]">
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
                <p className="text-sm text-[var(--admin-muted)]">{order.addressDetails}</p>
              ) : null}
            </>
          ) : null}
          {order.surprise ? (
            <p className="text-sm font-medium text-[#8a5a10]">Сюрприз</p>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="admin-section space-y-2">
            <h2 className="admin-section__title">Получатель</h2>
            <p>{order.recipientName ?? '—'}</p>
            <p className="text-sm text-[var(--admin-muted)]">{order.recipientPhoneE164 ?? '—'}</p>
          </div>
          <div className="admin-section space-y-2">
            <h2 className="admin-section__title">Заказчик</h2>
            <p>{order.purchaserName}</p>
            <p className="text-sm text-[var(--admin-muted)]">{order.purchaserPhoneE164}</p>
          </div>
        </div>
      </section>

      <section className="admin-section space-y-3">
        <h2 className="admin-section__title">Позиции</h2>
        <ul className="divide-y divide-[var(--admin-border)]">
          {order.items.map((item) => {
            const img = toSameOriginMediaUrl(item.primaryImageUrl);
            return (
              <li key={item.id} className="flex gap-4 py-3">
                <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface-muted)]">
                  {img ? (
                    <Image src={img} alt="" fill className="object-cover" sizes="56px" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-sm text-[var(--admin-muted)]">
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
        <div className="space-y-1 border-t border-[var(--admin-border)] pt-3 text-sm">
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

      <section className="admin-section space-y-2">
        <h2 className="admin-section__title">Сообщение</h2>
        {order.cardMessage ? (
          <p className="whitespace-pre-wrap text-sm">{order.cardMessage}</p>
        ) : (
          <p className="text-sm text-[var(--admin-muted)]">Без открытки</p>
        )}
        {order.anonymousCard ? (
          <p className="text-sm text-[var(--admin-muted)]">Не указывать отправителя</p>
        ) : null}
        {order.customerComment ? (
          <p className="text-sm text-[var(--admin-muted)]">Комментарий: {order.customerComment}</p>
        ) : null}
        {order.cancellationReason ? (
          <p className="admin-error">Отмена: {order.cancellationReason}</p>
        ) : null}
      </section>

      {erpEvents !== null ? (
        <OrderErpSection
          events={erpEvents}
          total={erpTotal}
          canOperate={canOperateIntegration}
        />
      ) : null}

      <section className="admin-section space-y-2">
        <h2 className="admin-section__title">История</h2>
        <ul className="space-y-2 text-sm">
          {order.events.map((ev) => (
            <li key={ev.id} className="flex flex-wrap gap-x-3 text-[var(--admin-ink)]">
              <span className="tabular-nums text-[var(--admin-muted)]">
                {new Date(ev.createdAt).toLocaleString('ru-BY')}
              </span>
              <span>{EVENT_TYPE_LABELS[ev.type] ?? ev.type}</span>
              {ev.fromStatus && ev.toStatus ? (
                <span>
                  {orderStatusLabel(ev.fromStatus)} → {orderStatusLabel(ev.toStatus)}
                </span>
              ) : null}
              {ev.message ? <span className="text-[var(--admin-muted)]">{ev.message}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

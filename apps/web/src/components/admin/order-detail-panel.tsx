'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  erpSyncStatusLabel,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  telegramNotifyStatusLabel,
  type OrderAdminDetailDto,
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

const EVENT_TYPE_LABELS: Record<string, string> = {
  ORDER_CREATED: 'Заказ создан',
  ORDER_CONFIRMED: 'Подтверждён',
  ORDER_PREPARING: 'Сборка',
  ORDER_READY: 'Готов',
  ORDER_OUT_FOR_DELIVERY: 'В доставке',
  ORDER_COMPLETED: 'Завершён',
  ORDER_CANCELLED: 'Отменён',
  PAYMENT_STATUS_CHANGED: 'Оплата изменена',
};

export function OrderDetailPanel({
  initial,
  erpEvents = null,
  erpTotal = 0,
  canOperateIntegration = false,
}: Props) {
  const order = initial;

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
          <p className="text-sm text-[var(--admin-muted)]">
            Операционная обработка — в ERP. Ниже мониторинг оплаты и синхронизации.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="admin-chip">
              {paymentMethodLabel(order.paymentMethod)} ·{' '}
              {paymentStatusLabel(order.paymentStatus)}
            </span>
            <span className="admin-chip">{erpSyncStatusLabel(order.erpSyncStatus)}</span>
            <span className="admin-chip">
              {telegramNotifyStatusLabel(order.telegramNotifyStatus)}
            </span>
          </div>
        </div>
      </header>

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
                    /шт
                    {item.optionsTotalMinor && item.optionsTotalMinor !== '0'
                      ? ` · опции ${formatPriceFromMinor(item.optionsTotalMinor, item.currency)}`
                      : ''}
                  </p>
                  {item.optionsSnapshot && item.optionsSnapshot.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-[var(--admin-muted)]">
                      {item.optionsSnapshot.map((opt) => (
                        <li key={opt.valueId}>
                          {opt.groupName}: {opt.valueName}
                          {opt.surchargeMinor !== '0'
                            ? ` (+${formatPriceFromMinor(opt.surchargeMinor, item.currency)})`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
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
        <h2 className="admin-section__title">История попыток</h2>
        {(order.deliveryAttempts ?? []).length === 0 ? (
          <p className="text-sm text-[var(--admin-muted)]">Попыток пока нет</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(order.deliveryAttempts ?? []).map((a) => (
              <li key={a.id}>
                {new Date(a.createdAt).toLocaleString('ru-BY')} · {a.channel} #{a.attemptNumber} ·{' '}
                {a.outcome}
                {a.remoteReference ? ` · ${a.remoteReference}` : ''}
                {a.errorSanitized ? ` — ${a.errorSanitized}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-section space-y-2">
        <h2 className="admin-section__title">События</h2>
        <ul className="space-y-2 text-sm">
          {order.events.map((event) => (
            <li key={event.id}>
              {new Date(event.createdAt).toLocaleString('ru-BY')} —{' '}
              {EVENT_TYPE_LABELS[event.type] ?? event.type}
              {event.message ? `: ${event.message}` : ''}
            </li>
          ))}
        </ul>
      </section>

      {erpEvents ? (
        <OrderErpSection
          events={erpEvents}
          total={erpTotal}
          canOperate={canOperateIntegration}
        />
      ) : null}
    </div>
  );
}

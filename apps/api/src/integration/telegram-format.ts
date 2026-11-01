import type { TelegramNotifyKind, TelegramNotifyPayloadV1 } from '@bouquet-one/contracts';
import { paymentMethodLabel, type PaymentMethod } from '@bouquet-one/contracts';

function money(minor: string, currency: string): string {
  const n = Number(minor);
  if (!Number.isFinite(n)) return `${minor} ${currency}`;
  return `${(n / 100).toFixed(2)} ${currency}`;
}

function kindTitle(kind: TelegramNotifyKind): string {
  switch (kind) {
    case 'AFTER_ERP_SUCCESS':
      return 'Новый заказ → ERP OK';
    case 'AFTER_ERP_FAILURE':
      return 'Новый заказ → ошибка ERP';
    case 'ERP_RECOVERED':
      return 'ERP синхронизация восстановлена';
    case 'PAYMENT_PAID':
      return 'Онлайн-оплата успешна';
    case 'PAYMENT_FAILED':
      return 'Онлайн-оплата не прошла';
    case 'CASH_ON_DELIVERY':
      return 'Заказ · наличные при получении';
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

/** Plain-text Telegram message (no Markdown — avoids injection / parse errors). */
export function formatTelegramNotifyText(payload: TelegramNotifyPayloadV1): string {
  const s = payload.snapshot;
  const method = paymentMethodLabel(s.paymentMethod as PaymentMethod);
  const lines = [
    kindTitle(payload.kind),
    `№ ${payload.orderNumber}`,
    '',
    ...s.itemLines.map(
      (i) => `• ${i.name} × ${i.quantity} — ${money(i.lineTotalMinor, s.currency)}`,
    ),
    '',
    `Итого: ${money(s.totalMinor, s.currency)}`,
    `${s.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}: ${s.fulfillmentDate}, ${s.timeWindowLabel}`,
    s.deliverySummary ? `Адрес: ${s.deliverySummary}` : null,
    `Покупатель: ${s.purchaserName}, ${s.purchaserPhoneMasked}`,
    `Оплата: ${method} (${s.paymentStatus})`,
    `ERP: ${s.erpSyncStatus}${s.erpRemoteReference ? ` · ${s.erpRemoteReference}` : ''}`,
    s.erpErrorSanitized ? `Ошибка ERP: ${s.erpErrorSanitized}` : null,
  ];
  return lines.filter((x): x is string => Boolean(x)).join('\n');
}

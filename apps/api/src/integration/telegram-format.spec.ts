import type { TelegramNotifyPayloadV1 } from '@bouquet-one/contracts';
import { formatTelegramNotifyText } from './telegram-format';

describe('formatTelegramNotifyText', () => {
  it('includes order number, payment and ERP result without secrets', () => {
    const payload: TelegramNotifyPayloadV1 = {
      eventId: 'e1',
      eventType: 'TELEGRAM_NOTIFY',
      schemaVersion: 1,
      kind: 'CASH_ON_DELIVERY',
      occurredAt: new Date().toISOString(),
      orderId: 'o1',
      orderNumber: '2026-10-28-0001',
      snapshot: {
        fulfillmentType: 'DELIVERY',
        fulfillmentDate: '2026-10-28',
        timeWindowLabel: '10:00–12:00',
        purchaserName: 'Иван',
        purchaserPhoneMasked: '+37529***',
        deliverySummary: 'ул. Пример',
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'NOT_REQUIRED',
        totalMinor: '9900',
        currency: 'BYN',
        itemLines: [{ name: 'Букет (Стандарт)', quantity: 1, lineTotalMinor: '9900' }],
        erpSyncStatus: 'SYNCED',
        erpRemoteReference: 'erp-1',
        erpErrorSanitized: null,
      },
    };
    const text = formatTelegramNotifyText(payload);
    expect(text).toContain('2026-10-28-0001');
    expect(text).toContain('Наличные');
    expect(text).toContain('erp-1');
    expect(text).not.toContain('bot');
    expect(text).not.toContain('token');
  });
});

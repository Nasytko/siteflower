import { buildStorefrontOrderCreatedV1 } from './payload';

describe('buildStorefrontOrderCreatedV1 payment snapshot', () => {
  it('embeds cash payment defaults for legacy-shaped orders', () => {
    const payload = buildStorefrontOrderCreatedV1({
      eventId: '11111111-1111-1111-1111-111111111111',
      order: {
        id: '22222222-2222-2222-2222-222222222222',
        orderNumber: '2026-10-28-0002',
        createdAt: new Date('2026-10-28T10:00:00.000Z'),
        status: 'RECEIVED',
        fulfillmentType: 'PICKUP',
        fulfillmentDate: '2026-10-28',
        timeWindowId: 'tw',
        timeWindowLabel: '10–12',
        timeWindowStartMinutes: 600,
        timeWindowEndMinutes: 720,
        purchaserName: 'Test',
        purchaserPhoneE164: '+375291112233',
        recipientName: null,
        recipientPhoneE164: null,
        surprise: false,
        addressKnown: true,
        deliveryAddress: null,
        addressDetails: null,
        cardMessage: null,
        anonymousCard: false,
        customerComment: null,
        currency: 'BYN',
        subtotalMinor: 1000,
        deliveryFeeMinor: 0,
        totalMinor: 1000,
      },
      items: [
        {
          productId: 'p',
          variantId: 'v',
          productName: 'A',
          productSlug: 'a',
          variantName: 'S',
          quantity: 1,
          unitPriceMinor: 1000,
          originalUnitPriceMinor: null,
          promotionType: null,
          lineTotalMinor: 1000,
          currency: 'BYN',
        },
      ],
    });
    expect(payload.order.payment.method).toBe('CASH_ON_DELIVERY');
    expect(payload.order.payment.status).toBe('NOT_REQUIRED');
  });
});

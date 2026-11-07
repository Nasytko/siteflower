import type { CreateOrderRequest } from '@bouquet-one/contracts';
import {
  hashCreateOrderPayload,
  hashCreateOrderPayloadLegacy,
  idempotencyHashesMatch,
} from './orders.service';

function sample(overrides: Partial<CreateOrderRequest> = {}): CreateOrderRequest {
  return {
    idempotencyKey: 'idemp-test-key-001',
    items: [{ productId: '11111111-1111-4111-8111-111111111111', variantId: '22222222-2222-4222-8222-222222222222', quantity: 1 }],
    fulfillmentType: 'DELIVERY',
    purchaserName: 'Павел',
    purchaserPhone: '+375291111111',
    recipientName: 'Анна',
    recipientPhone: '+375292222222',
    fulfillmentDate: '2026-11-08',
    timeWindowId: 'tw-1',
    confirmedQuote: {
      fulfillmentType: 'DELIVERY',
      items: [
        {
          productId: '11111111-1111-4111-8111-111111111111',
          variantId: '22222222-2222-4222-8222-222222222222',
          quantity: 1,
          unitPriceMinor: '14900',
          optionsTotalMinor: '0',
          lineTotalMinor: '14900',
        },
      ],
      subtotalMinor: '14900',
      deliveryFeeMinor: '0',
      totalMinor: '14900',
    },
    ...overrides,
  };
}

describe('hashCreateOrderPayload', () => {
  it('ignores confirmed quote amounts so post-commit replay survives price drift', () => {
    const a = hashCreateOrderPayload(sample());
    const b = hashCreateOrderPayload(
      sample({
        confirmedQuote: {
          fulfillmentType: 'DELIVERY',
          items: [
            {
              productId: '11111111-1111-4111-8111-111111111111',
              variantId: '22222222-2222-4222-8222-222222222222',
              quantity: 1,
              unitPriceMinor: '99999',
              optionsTotalMinor: '0',
              lineTotalMinor: '99999',
            },
          ],
          subtotalMinor: '99999',
          deliveryFeeMinor: '0',
          totalMinor: '99999',
        },
      }),
    );
    expect(a).toBe(b);
  });

  it('changes when option selections change (v2)', () => {
    const plain = hashCreateOrderPayload(sample());
    const withOpts = hashCreateOrderPayload(
      sample({
        items: [
          {
            productId: '11111111-1111-4111-8111-111111111111',
            variantId: '22222222-2222-4222-8222-222222222222',
            quantity: 1,
            optionValueIds: ['33333333-3333-4333-8333-333333333333'],
          },
        ],
      }),
    );
    expect(plain).not.toBe(withOpts);
  });

  it('matches legacy stored hashes that omitted optionValueIds', () => {
    const dto = sample({
      items: [
        {
          productId: '11111111-1111-4111-8111-111111111111',
          variantId: '22222222-2222-4222-8222-222222222222',
          quantity: 1,
          optionValueIds: ['33333333-3333-4333-8333-333333333333'],
        },
      ],
    });
    const legacy = hashCreateOrderPayloadLegacy(dto);
    expect(idempotencyHashesMatch(legacy, dto)).toBe(true);
  });
});

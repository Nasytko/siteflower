import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminPromotionListItemDto } from '@bouquet-one/contracts';
import {
  promotionDiscountLabel,
  promotionPeriodLabel,
  promotionRegularPriceLabel,
  promotionSalePriceLabel,
  promotionStatusView,
  promotionTypeForRow,
} from './admin-promotions';

function row(
  overrides: Partial<AdminPromotionListItemDto> & {
    promotionAdmin?: Partial<AdminPromotionListItemDto['promotionAdmin']>;
  } = {},
): AdminPromotionListItemDto {
  const { promotionAdmin: promoOverrides, ...rest } = overrides;
  return {
    id: 'p1',
    slug: 'rozy',
    name: 'Розы',
    lifecycle: 'PUBLISHED',
    availability: 'AVAILABLE',
    heightCm: null,
    bouquetSize: null,
    price: {
      currency: 'BYN',
      minMinor: '9900',
      maxMinor: '9900',
      single: true,
      label: '99,00 BYN',
    },
    promotion: {
      type: 'PERCENT',
      percentOff: 20,
      originalPrice: {
        currency: 'BYN',
        minMinor: '9900',
        maxMinor: '9900',
        single: true,
        label: '99,00 BYN',
      },
      salePrice: {
        currency: 'BYN',
        minMinor: '7920',
        maxMinor: '7920',
        single: true,
        label: '79,20 BYN',
      },
    },
    defaultVariant: null,
    primaryImageUrl: null,
    flowers: [],
    colors: [],
    productLines: [],
    updatedAt: '2026-03-08T09:00:00.000Z',
    promotionAdmin: {
      enabled: true,
      type: 'PERCENT',
      percentOff: 20,
      startsAt: null,
      endsAt: null,
      variantSalePrices: [],
      version: 1,
      currentlyEffective: true,
      ...promoOverrides,
    },
    status: 'active',
    ...rest,
  };
}

test('empty-safe price labels never throw when public promotion is null', () => {
  const disabled = row({
    promotion: null,
    status: 'disabled',
    promotionAdmin: { enabled: false, currentlyEffective: false },
  });
  assert.equal(promotionRegularPriceLabel(disabled), '99,00 BYN');
  assert.equal(promotionSalePriceLabel(disabled), '—');
  assert.equal(promotionDiscountLabel(disabled), '−20%');
  assert.equal(promotionStatusView(disabled).tone, 'off');
});

test('active promotion shows sale price and status', () => {
  const active = row();
  assert.equal(promotionSalePriceLabel(active), '79,20 BYN');
  assert.equal(promotionDiscountLabel(active), '−20%');
  assert.equal(promotionStatusView(active).label, 'Идёт сейчас');
  assert.equal(promotionTypeForRow(active), 'Процент скидки');
});

test('period label handles open-ended schedule', () => {
  assert.equal(promotionPeriodLabel(row()), 'Без срока');
  assert.match(
    promotionPeriodLabel(
      row({
        promotionAdmin: {
          startsAt: '2026-03-01T09:00:00.000Z',
          endsAt: null,
        },
      }),
    ),
    /бессрочно/,
  );
});

test('missing price ranges stay as em dash (bad-row safe)', () => {
  const broken = row({
    price: null,
    promotion: {
      type: 'PERCENT',
      percentOff: 10,
      // @ts-expect-error intentional partial for resilience check
      originalPrice: undefined,
      // @ts-expect-error intentional partial for resilience check
      salePrice: undefined,
    },
  });
  assert.equal(promotionRegularPriceLabel(broken), '—');
  assert.equal(promotionSalePriceLabel(broken), '—');
});

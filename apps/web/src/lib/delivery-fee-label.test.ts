import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDeliveryFeeLabel } from './delivery-fee-label';

test('formatDeliveryFeeLabel matches checkout-facing copy', () => {
  assert.equal(formatDeliveryFeeLabel('0', 'BYN'), 'Бесплатно');
  assert.equal(formatDeliveryFeeLabel('1500', 'BYN'), '15 BYN');
  assert.equal(formatDeliveryFeeLabel('1505', 'BYN'), '15.05 BYN');
  assert.equal(formatDeliveryFeeLabel('abc', 'BYN'), 'Стоимость уточняйте');
  assert.equal(formatDeliveryFeeLabel('-1', 'BYN'), 'Стоимость уточняйте');
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPaymentForMethod,
  paymentMethodLabel,
  paymentStatusLabel,
} from './orders';

describe('order payment helpers', () => {
  it('maps cash to NOT_REQUIRED (not a payment failure)', () => {
    assert.deepEqual(defaultPaymentForMethod('CASH_ON_DELIVERY'), {
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentStatus: 'NOT_REQUIRED',
    });
    assert.equal(paymentStatusLabel('NOT_REQUIRED').includes('получении'), true);
    assert.equal(paymentMethodLabel('CASH_ON_DELIVERY').includes('Наличные'), true);
  });

  it('maps card online to awaiting (provider not wired yet)', () => {
    assert.deepEqual(defaultPaymentForMethod('CARD_ONLINE'), {
      paymentMethod: 'CARD_ONLINE',
      paymentStatus: 'AWAITING_PAYMENT',
    });
  });
});

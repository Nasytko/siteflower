import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedOrderTransitions,
  isOrderTransitionAllowed,
  orderStatusLabel,
} from './orders';

test('delivery status path includes DELIVERING then COMPLETED', () => {
  assert.deepEqual(allowedOrderTransitions('RECEIVED', 'DELIVERY'), [
    'CONFIRMED',
    'CANCELLED',
  ]);
  assert.deepEqual(allowedOrderTransitions('READY', 'DELIVERY'), [
    'DELIVERING',
    'CANCELLED',
  ]);
  assert.equal(isOrderTransitionAllowed('DELIVERING', 'COMPLETED', 'DELIVERY'), true);
  assert.equal(isOrderTransitionAllowed('READY', 'COMPLETED', 'DELIVERY'), false);
});

test('pickup READY goes to COMPLETED without DELIVERING', () => {
  assert.deepEqual(allowedOrderTransitions('READY', 'PICKUP'), [
    'COMPLETED',
    'CANCELLED',
  ]);
  assert.equal(isOrderTransitionAllowed('READY', 'DELIVERING', 'PICKUP'), false);
});

test('terminal statuses have no transitions', () => {
  assert.deepEqual(allowedOrderTransitions('COMPLETED', 'DELIVERY'), []);
  assert.deepEqual(allowedOrderTransitions('CANCELLED', 'PICKUP'), []);
});

test('orderStatusLabel covers all statuses', () => {
  assert.equal(orderStatusLabel('RECEIVED'), 'Заказ получен');
  assert.equal(orderStatusLabel('CONFIRMED'), 'Заказ подтверждён');
  assert.equal(orderStatusLabel('PREPARING'), 'Собираем букет');
  assert.equal(orderStatusLabel('CANCELLED'), 'Отменён');
});

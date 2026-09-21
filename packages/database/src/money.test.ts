import assert from 'node:assert/strict';
import test from 'node:test';
import { addMoneyMinor, formatMoneyMinor } from './money.js';

test('formatMoneyMinor formats BYN kopecks', () => {
  assert.equal(
    formatMoneyMinor({ currency: 'BYN', amountMinor: 1299n }),
    '12.99 BYN',
  );
});

test('addMoneyMinor adds same currency', () => {
  const sum = addMoneyMinor(
    { currency: 'BYN', amountMinor: 100n },
    { currency: 'BYN', amountMinor: 50n },
  );
  assert.equal(sum.amountMinor, 150n);
});

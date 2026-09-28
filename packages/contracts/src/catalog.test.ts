import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPercentOff,
  budgetRangeMatchesPrice,
  deriveDisplayPercentOff,
  derivePriceRange,
  formatPriceRangeLabel,
  normalizeSlug,
  defaultProductSeoTitle,
} from './catalog.js';

test('derivePriceRange single', () => {
  const range = derivePriceRange('BYN', [9900n]);
  assert.equal(range?.single, true);
  assert.equal(range?.label.includes('99,00'), true);
});

test('derivePriceRange range label', () => {
  const range = derivePriceRange('BYN', [9900n, 14900n, 19900n]);
  assert.equal(range?.single, false);
  assert.equal(range?.minMinor, '9900');
  assert.equal(range?.maxMinor, '19900');
  assert.match(range!.label, /^от /);
});

test('normalizeSlug', () => {
  assert.equal(normalizeSlug('  Améli Premium  '), 'ameli-premium');
});

test('defaultProductSeoTitle', () => {
  assert.match(defaultProductSeoTitle('Амели'), /Амели/);
  assert.match(defaultProductSeoTitle('Амели'), /BUKET №1/);
});

test('formatPriceRangeLabel', () => {
  const f = formatPriceRangeLabel('BYN', 100n, 100n);
  assert.equal(f.single, true);
});

test('applyPercentOff rounds half-up', () => {
  assert.equal(applyPercentOff(10000n, 15), 8500n);
  assert.equal(applyPercentOff(99n, 10), 89n);
});

test('deriveDisplayPercentOff', () => {
  assert.equal(deriveDisplayPercentOff(12000n, 9900n), 17);
  assert.equal(deriveDisplayPercentOff(100n, 100n), null);
});

test('budgetRangeMatchesPrice', () => {
  assert.equal(budgetRangeMatchesPrice(8000n, null, 8000n), true);
  assert.equal(budgetRangeMatchesPrice(8001n, null, 8000n), false);
  assert.equal(budgetRangeMatchesPrice(25000n, 25000n, null), true);
  assert.equal(budgetRangeMatchesPrice(24999n, 25000n, null), false);
  assert.equal(budgetRangeMatchesPrice(10000n, 8000n, 12000n), true);
});

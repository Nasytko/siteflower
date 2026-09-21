import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
  assert.match(defaultProductSeoTitle('Амели'), /БУКЕТ №1/);
});

test('formatPriceRangeLabel', () => {
  const f = formatPriceRangeLabel('BYN', 100n, 100n);
  assert.equal(f.single, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { trimmedOrNull } from './string.util';

test('trimmedOrNull', () => {
  assert.equal(trimmedOrNull(null), null);
  assert.equal(trimmedOrNull(undefined), null);
  assert.equal(trimmedOrNull(''), null);
  assert.equal(trimmedOrNull('   '), null);
  assert.equal(trimmedOrNull('  hello  '), 'hello');
});

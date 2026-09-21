import assert from 'node:assert/strict';
import test from 'node:test';
import { cn } from './cn.js';

test('cn merges conflicting tailwind classes', () => {
  assert.equal(cn('px-2', 'px-4'), 'px-4');
});

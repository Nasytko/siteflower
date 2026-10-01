import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_MEDIA_MAX_DIMENSION } from './admin-media-preflight';
import { fitAdminMediaDimensions } from './admin-media-prepare';

test('6192×4128 → 6000×4000', () => {
  assert.deepEqual(fitAdminMediaDimensions(6192, 4128), { width: 6000, height: 4000 });
});

test('4000×6000 portrait → 4000×6000 at cap', () => {
  assert.deepEqual(fitAdminMediaDimensions(4000, 7000), { width: 3429, height: 6000 });
});

test('small image not enlarged', () => {
  assert.deepEqual(fitAdminMediaDimensions(800, 600), { width: 800, height: 600 });
});

test('exact max edge unchanged', () => {
  assert.deepEqual(fitAdminMediaDimensions(6000, 4000), { width: 6000, height: 4000 });
});

test('default max edge matches ADMIN_MEDIA_MAX_DIMENSION', () => {
  assert.equal(ADMIN_MEDIA_MAX_DIMENSION, 6000);
  const fitted = fitAdminMediaDimensions(9000, 6000);
  assert.equal(Math.max(fitted.width, fitted.height), 6000);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { unwrapAdminList } from './admin-list';

test('unwrapAdminList reads paginated items', () => {
  assert.deepEqual(
    unwrapAdminList({ items: [{ id: '1' }], total: 1, page: 1, pageSize: 50 }),
    [{ id: '1' }],
  );
});

test('unwrapAdminList accepts bare arrays', () => {
  assert.deepEqual(unwrapAdminList([{ id: '2' }]), [{ id: '2' }]);
});

test('unwrapAdminList returns empty for invalid payloads', () => {
  assert.deepEqual(unwrapAdminList(null), []);
  assert.deepEqual(unwrapAdminList(undefined), []);
  assert.deepEqual(unwrapAdminList({} as never), []);
});

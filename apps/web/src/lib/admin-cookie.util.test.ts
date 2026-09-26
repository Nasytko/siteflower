import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_SESSION_COOKIE } from '@bouquet-one/contracts';
import { buildAdminCookieHeader } from './admin-cookie.util';

test('buildAdminCookieHeader forwards only the admin session cookie', () => {
  const header = buildAdminCookieHeader([
    { name: 'other', value: 'x' },
    { name: ADMIN_SESSION_COOKIE, value: 'sess-token' },
    { name: 'marketing', value: '1' },
  ]);
  assert.equal(header, `${ADMIN_SESSION_COOKIE}=sess-token`);
});

test('buildAdminCookieHeader returns undefined when session cookie is absent', () => {
  assert.equal(buildAdminCookieHeader([{ name: 'other', value: 'x' }]), undefined);
});

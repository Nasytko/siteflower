import assert from 'node:assert/strict';
import test from 'node:test';
import { API_V1_PREFIX } from './index.js';
import {
  roleHasAllPermissions,
  roleHasPermission,
  ROLE_PERMISSIONS,
} from './permissions';

test('API_V1_PREFIX is stable', () => {
  assert.equal(API_V1_PREFIX, '/api/v1');
});

test('SUPER_ADMIN has all permissions', () => {
  assert.equal(roleHasPermission('SUPER_ADMIN', 'USERS_DISABLE'), true);
  assert.equal(roleHasPermission('SUPER_ADMIN', 'SITE_HEALTH_READ'), true);
});

test('CONTENT_MANAGER cannot manage users', () => {
  assert.equal(roleHasPermission('CONTENT_MANAGER', 'USERS_CREATE'), false);
  assert.equal(roleHasAllPermissions('CONTENT_MANAGER', ['ADMIN_ACCESS', 'SEO_UPDATE']), true);
});

test('MANAGER cannot reset passwords', () => {
  assert.equal(roleHasPermission('MANAGER', 'USERS_RESET_PASSWORD'), false);
  assert.equal(roleHasPermission('MANAGER', 'ORDERS_UPDATE'), true);
});

test('deny by default: empty required list is vacuously true; unknown not granted', () => {
  assert.equal(roleHasAllPermissions('MANAGER', []), true);
  assert.equal(ROLE_PERMISSIONS.CONTENT_MANAGER.includes('SETTINGS_UPDATE'), false);
});

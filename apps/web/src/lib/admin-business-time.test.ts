import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_BUSINESS_TIMEZONE,
  businessLocalToUtcIso,
  utcIsoToBusinessLocal,
} from './admin-business-time';

test('businessLocalToUtcIso interprets Minsk wall time as UTC+3', () => {
  const iso = businessLocalToUtcIso('2026-10-01T18:00', ADMIN_BUSINESS_TIMEZONE);
  assert.equal(iso, '2026-10-01T15:00:00.000Z');
});

test('utcIsoToBusinessLocal formats Minsk wall time', () => {
  const local = utcIsoToBusinessLocal('2026-10-01T15:00:00.000Z', ADMIN_BUSINESS_TIMEZONE);
  assert.equal(local, '2026-10-01T18:00');
});

test('round-trip business local ↔ UTC', () => {
  const local = '2026-03-15T09:30';
  const iso = businessLocalToUtcIso(local);
  assert.ok(iso);
  assert.equal(utcIsoToBusinessLocal(iso), local);
});

test('empty and invalid values', () => {
  assert.equal(businessLocalToUtcIso(''), null);
  assert.equal(businessLocalToUtcIso('not-a-date'), null);
  assert.equal(utcIsoToBusinessLocal(null), '');
  assert.equal(utcIsoToBusinessLocal('bad'), '');
});

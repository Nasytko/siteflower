import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AdminRequestError,
  buildAdminRequestError,
  defaultMessageForKind,
  fieldErrorMap,
  kindFromStatus,
  mediaErrorUserText,
} from './admin-client';

test('maps status codes to kinds', () => {
  assert.equal(kindFromStatus(400), 'validation');
  assert.equal(kindFromStatus(401), 'unauthorized');
  assert.equal(kindFromStatus(403), 'forbidden');
  assert.equal(kindFromStatus(404), 'not_found');
  assert.equal(kindFromStatus(409), 'conflict');
  assert.equal(kindFromStatus(429), 'rate_limit');
  assert.equal(kindFromStatus(500), 'server');
  assert.equal(kindFromStatus(0), 'network');
});

test('builds OCC conflict message for 409', () => {
  const err = buildAdminRequestError(409, { message: 'whatever', requestId: 'req-1' });
  assert.equal(err.kind, 'conflict');
  assert.match(err.message, /другим пользователем/i);
  assert.equal(err.requestId, 'req-1');
  assert.equal(err.retryable, false);
});

test('maps validation issues to fieldErrors', () => {
  const err = buildAdminRequestError(400, {
    message: 'Акцию нельзя сохранить',
    error: 'PromotionValidationError',
    issues: [
      { code: 'INVALID_PERCENT', message: 'Процент скидки должен быть от 1 до 99', field: 'percentOff' },
    ],
    requestId: 'r2',
  });
  assert.equal(err.kind, 'validation');
  assert.equal(err.fieldErrors[0]?.field, 'percentOff');
  assert.match(fieldErrorMap(err).percentOff ?? '', /1 до 99/);
});

test('includes requestId for server errors', () => {
  const err = buildAdminRequestError(500, {
    message: 'Internal server error',
    requestId: 'abc-123',
  });
  assert.equal(err.kind, 'server');
  assert.match(err.message, /abc-123/);
  assert.equal(err.retryable, true);
});

test('maps network failures', () => {
  const err = buildAdminRequestError(0, null, null, true);
  assert.equal(err.kind, 'network');
  assert.equal(err.message, defaultMessageForKind('network', 0));
});

test('maps media codes to user text', () => {
  const err = new AdminRequestError('x', 400, { code: 'IMAGE_DECODE_FAILED', kind: 'validation' });
  assert.match(mediaErrorUserText(err), /прочитать|повреждён/i);
});

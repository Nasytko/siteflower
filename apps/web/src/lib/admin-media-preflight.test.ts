import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_MEDIA_MAX_INPUT_BYTES,
  formatMediaBytes,
  preflightMediaBatch,
  preflightMediaFile,
} from './admin-media-preflight';
import { fitAdminMediaDimensions } from './admin-media-prepare';

function fakeFile(name: string, size: number, type: string): File {
  const buf = new Uint8Array(Math.min(size, 16));
  const file = new File([buf], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

test('preflightMediaFile rejects over hard input limit', async () => {
  const result = await preflightMediaFile(
    fakeFile('big.jpg', ADMIN_MEDIA_MAX_INPUT_BYTES + 1, 'image/jpeg'),
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /25 МБ|слишком большой/i);
});

test('preflightMediaFile accepts file under 25MB even if over former 8MB', async () => {
  const result = await preflightMediaFile(fakeFile('phone.jpg', 11_000_000, 'image/jpeg'));
  assert.equal(result.ok, true);
});

test('preflightMediaFile rejects bad mime', async () => {
  const result = await preflightMediaFile(fakeFile('doc.pdf', 1000, 'application/pdf'));
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /Неподдерживаемый/);
});

test('preflightMediaFile accepts jpeg under limit', async () => {
  const result = await preflightMediaFile(fakeFile('ok.jpg', 3_200_000, 'image/jpeg'));
  assert.equal(result.ok, true);
});

test('preflightMediaBatch keeps valid when mixed', async () => {
  const { accepted, rejected } = await preflightMediaBatch(
    [
      fakeFile('ok.jpg', 1_000_000, 'image/jpeg'),
      fakeFile('big.jpg', ADMIN_MEDIA_MAX_INPUT_BYTES + 5_000_000, 'image/jpeg'),
    ],
    0,
  );
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0]!.error ?? '', /слишком большой/i);
});

test('preflightMediaBatch respects gallery capacity', async () => {
  const { accepted, capacityError } = await preflightMediaBatch(
    [fakeFile('a.jpg', 1000, 'image/jpeg'), fakeFile('b.jpg', 1000, 'image/jpeg')],
    11,
  );
  assert.equal(accepted.length, 1);
  assert.match(capacityError ?? '', /ещё 1/);
});

test('fitAdminMediaDimensions downscales 6192×4128 to ≤6000', () => {
  const fitted = fitAdminMediaDimensions(6192, 4128, 6000);
  assert.ok(Math.max(fitted.width, fitted.height) <= 6000);
  assert.equal(fitted.width, 6000);
  assert.equal(fitted.height, 4000);
});

test('fitAdminMediaDimensions does not upscale small images', () => {
  assert.deepEqual(fitAdminMediaDimensions(1200, 900, 6000), { width: 1200, height: 900 });
});

test('formatMediaBytes uses MB for large values', () => {
  assert.equal(formatMediaBytes(25_000_000), '25 МБ');
  assert.equal(formatMediaBytes(1_800_000), '1.8 МБ');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { preflightMediaBatch, preflightMediaFile } from './admin-media-preflight';

function fakeFile(name: string, size: number, type: string): File {
  const buf = new Uint8Array(Math.min(size, 16));
  const file = new File([buf], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

test('preflightMediaFile rejects oversize', async () => {
  const result = await preflightMediaFile(fakeFile('big.jpg', 9_000_000, 'image/jpeg'));
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /8 MB/);
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
      fakeFile('big.jpg', 9_000_000, 'image/jpeg'),
    ],
    0,
  );
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0]!.error ?? '', /8 MB/);
});

test('preflightMediaBatch respects gallery capacity', async () => {
  const { accepted, capacityError } = await preflightMediaBatch(
    [fakeFile('a.jpg', 1000, 'image/jpeg'), fakeFile('b.jpg', 1000, 'image/jpeg')],
    11,
  );
  assert.equal(accepted.length, 1);
  assert.match(capacityError ?? '', /ещё 1/);
});

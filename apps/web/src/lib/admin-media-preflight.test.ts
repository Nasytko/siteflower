import assert from 'node:assert/strict';
import test from 'node:test';
import { preflightMediaBatch, preflightMediaFile } from './admin-media-preflight';

function fakeFile(name: string, size: number, type: string): File {
  const file = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

test('preflightMediaFile rejects oversize', () => {
  const result = preflightMediaFile(fakeFile('big.jpg', 9_000_000, 'image/jpeg'));
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /8 MB/);
});

test('preflightMediaFile rejects bad mime', () => {
  const result = preflightMediaFile(fakeFile('doc.pdf', 1000, 'application/pdf'));
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /Неподдерживаемый/);
});

test('preflightMediaFile accepts jpeg under limit', () => {
  const result = preflightMediaFile(fakeFile('ok.jpg', 3_200_000, 'image/jpeg'));
  assert.equal(result.ok, true);
});

test('preflightMediaBatch keeps valid when mixed', () => {
  const { accepted, rejected } = preflightMediaBatch(
    [
      fakeFile('photo1.jpg', 3_200_000, 'image/jpeg'),
      fakeFile('photo2.jpg', 5_400_000, 'image/jpeg'),
      fakeFile('photo3.jpg', 12_100_000, 'image/jpeg'),
    ],
    0,
  );
  assert.equal(accepted.length, 2);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0]!.error ?? '', /8 MB/);
});

test('preflightMediaBatch respects gallery capacity', () => {
  const { accepted, capacityError } = preflightMediaBatch(
    [fakeFile('a.jpg', 1000, 'image/jpeg'), fakeFile('b.jpg', 1000, 'image/jpeg')],
    11,
  );
  assert.equal(accepted.length, 1);
  assert.ok(capacityError);
});

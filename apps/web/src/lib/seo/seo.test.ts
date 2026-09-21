import assert from 'node:assert/strict';
import test from 'node:test';
import { absoluteUrl } from './site-url';
import { serializeJsonLd } from './json-ld';
import { getIndexingPolicy } from './indexing';

test('absoluteUrl joins site origin and path', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  assert.equal(absoluteUrl('/admin'), 'http://localhost:3000/admin');
});

test('non-production indexing is noindex by default', () => {
  const previousAllow = process.env.ALLOW_INDEXING;
  process.env.ALLOW_INDEXING = 'false';

  // NODE_ENV is typically development/test under the test runner
  const policy = getIndexingPolicy();
  if (process.env.NODE_ENV !== 'production') {
    assert.equal(policy.allowIndexing, false);
  }

  process.env.ALLOW_INDEXING = previousAllow;
});

test('serializeJsonLd escapes < to prevent script breakout', () => {
  const raw = serializeJsonLd({ name: '</script>' });
  assert.equal(raw.includes('</script>'), false);
  assert.equal(raw.includes('\\u003c/script>'), true);
});

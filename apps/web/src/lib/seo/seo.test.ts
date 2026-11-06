import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_HOMEPAGE_H1,
  DEFAULT_HOMEPAGE_SEO_DESCRIPTION,
  DEFAULT_HOMEPAGE_SEO_TITLE,
  resolveHomepageSeo,
} from '@bouquet-one/contracts';
import { absoluteUrl } from './site-url';
import { buildWebSiteJsonLd, serializeJsonLd } from './json-ld';
import { getIndexingPolicy } from './indexing';
import { withBrandTitle } from './metadata';

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

test('withBrandTitle keeps brand once', () => {
  assert.equal(withBrandTitle('Контакты'), 'Контакты | BUKET №1');
  assert.equal(
    withBrandTitle('Цветы в Гродно с бесплатной доставкой | BUKET №1'),
    'Цветы в Гродно с бесплатной доставкой | BUKET №1',
  );
});

test('resolveHomepageSeo falls back to local SEO defaults', () => {
  assert.deepEqual(resolveHomepageSeo({}), {
    title: DEFAULT_HOMEPAGE_SEO_TITLE,
    description: DEFAULT_HOMEPAGE_SEO_DESCRIPTION,
    h1: DEFAULT_HOMEPAGE_H1,
  });
  assert.equal(resolveHomepageSeo({ seoTitle: '  Ручной  ' }).title, 'Ручной');
});

test('buildWebSiteJsonLd includes alternate brand names', () => {
  const ld = buildWebSiteJsonLd({
    name: 'BUKET №1',
    alternateName: ['Букет №1', 'Букет номер один'],
    url: 'https://buketnomer1.by/',
  });
  assert.equal(ld['@type'], 'WebSite');
  assert.deepEqual(ld.alternateName, ['Букет №1', 'Букет номер один']);
});

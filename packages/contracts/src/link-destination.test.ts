import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferLinkDestinationFromHref,
  resolveLinkDestinationHref,
  systemRouteHref,
  validateCustomHref,
} from './link-destination';

describe('link destination', () => {
  it('resolves system routes', () => {
    assert.equal(systemRouteHref('catalog'), '/catalog');
    assert.equal(systemRouteHref('bouquets'), '/catalog/bouquets');
    assert.equal(
      resolveLinkDestinationHref({ kind: 'system', ref: 'promotions' }),
      '/akcii',
    );
  });

  it('validates custom hrefs', () => {
    assert.equal(validateCustomHref('/catalog/roses').ok, true);
    assert.equal(validateCustomHref('https://example.com/x').ok, true);
    assert.equal(validateCustomHref('javascript:alert(1)').ok, false);
    assert.equal(validateCustomHref('//evil.test').ok, false);
  });

  it('resolves catalog_page via id lookup', () => {
    const href = resolveLinkDestinationHref(
      { kind: 'catalog_page', ref: 'page-1', href: '/catalog/old' },
      '/catalog/old',
      { catalogSlugById: { 'page-1': 'roses' } },
    );
    assert.equal(href, '/catalog/roses');
  });

  it('infers destinations from legacy hrefs', () => {
    assert.deepEqual(inferLinkDestinationFromHref('/'), {
      kind: 'system',
      ref: 'home',
      href: '/',
    });
    assert.deepEqual(inferLinkDestinationFromHref('/catalog/bouquets'), {
      kind: 'system',
      ref: 'bouquets',
      href: '/catalog/bouquets',
    });
    assert.equal(inferLinkDestinationFromHref('/catalog/roses').kind, 'custom');
    assert.equal(inferLinkDestinationFromHref('https://t.me/x').kind, 'custom');
  });
});

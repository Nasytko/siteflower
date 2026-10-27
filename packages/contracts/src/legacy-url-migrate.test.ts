import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateLegacyInternalHref } from './legacy-url-migrate';
import { LEGACY_PATH_REDIRECTS, productPublicHref, catalogPublicHref } from './public-routes';

test('migrateLegacyInternalHref rewrites product and hub paths', () => {
  assert.equal(migrateLegacyInternalHref('/bukety/nezhnost'), '/products/nezhnost');
  assert.equal(migrateLegacyInternalHref('/bukety/nezhnost?x=1'), '/products/nezhnost?x=1');
  assert.equal(migrateLegacyInternalHref('/bukety'), '/catalog/bouquets');
  assert.equal(migrateLegacyInternalHref('/bukety?color=belyy'), '/catalog/bouquets?color=belyy');
  assert.equal(migrateLegacyInternalHref('/cvety'), '/catalog/stems');
  assert.equal(migrateLegacyInternalHref('/cvety/rozy'), '/catalog/bouquets?flower=rozy');
  assert.equal(migrateLegacyInternalHref('/katalog/rozy'), '/catalog/roses');
  assert.equal(migrateLegacyInternalHref('/katalog'), '/catalog');
  assert.equal(migrateLegacyInternalHref('/p/mono-bouquets'), '/catalog/mono-bouquets');
  assert.equal(migrateLegacyInternalHref('/catalog/bukety'), '/catalog/bouquets');
});

test('migrateLegacyInternalHref preserves external and unrelated paths', () => {
  assert.equal(migrateLegacyInternalHref('https://instagram.com/p/abc'), null);
  assert.equal(migrateLegacyInternalHref('/povod/den-rozhdeniya'), null);
  assert.equal(migrateLegacyInternalHref('/dostavka'), null);
  assert.equal(migrateLegacyInternalHref('/catalog/bouquets'), null);
  assert.equal(migrateLegacyInternalHref('/products/x'), null);
});

test('LEGACY_PATH_REDIRECTS has no chains or loops among catalog cutover sources', () => {
  const sources = new Set(LEGACY_PATH_REDIRECTS.map((r) => r.source));
  for (const row of LEGACY_PATH_REDIRECTS) {
    assert.equal(row.permanent, true);
    // Destination path (strip query) must not equal another redirect source with same pattern family.
    const destPath = row.destination.split('?')[0]!;
    assert.ok(!sources.has(destPath), `chain risk: ${row.source} → ${destPath} is also a source`);
    assert.notEqual(row.source, destPath);
  }
  assert.ok(LEGACY_PATH_REDIRECTS.some((r) => r.source === '/bukety/:slug'));
  assert.equal(
    LEGACY_PATH_REDIRECTS.find((r) => r.source === '/bukety/:slug')?.destination,
    '/products/:slug',
  );
});

test('public href helpers match canonical English routes', () => {
  assert.equal(productPublicHref('nezhnost'), '/products/nezhnost');
  assert.equal(catalogPublicHref('bukety'), '/catalog/bouquets');
  assert.equal(catalogPublicHref('rozy'), '/catalog/roses');
});

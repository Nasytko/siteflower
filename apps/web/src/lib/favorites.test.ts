import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyFavorites,
  isFavorite,
  parseFavorites,
  toggleFavorite,
} from './favorites';

test('parseFavorites returns empty state for null/invalid', () => {
  assert.deepEqual(parseFavorites(null), emptyFavorites());
  assert.deepEqual(parseFavorites('{'), emptyFavorites());
  assert.deepEqual(parseFavorites('{"version":2,"items":[]}'), emptyFavorites());
});

test('parseFavorites keeps valid entries only', () => {
  const raw = JSON.stringify({
    version: 1,
    items: [
      { productId: 'a', slug: 'ameli', savedAt: '2026-01-01T00:00:00.000Z' },
      { productId: 1, slug: 'bad' },
    ],
  });
  const parsed = parseFavorites(raw);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0]?.slug, 'ameli');
});

test('toggleFavorite adds then removes', () => {
  const added = toggleFavorite(emptyFavorites(), { productId: 'p1', slug: 'miya' });
  assert.equal(isFavorite(added, 'p1'), true);
  assert.equal(added.items.length, 1);

  const removed = toggleFavorite(added, { productId: 'p1', slug: 'miya' });
  assert.equal(isFavorite(removed, 'p1'), false);
  assert.equal(removed.items.length, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { filterDiscoveryTiles } from './discovery-tiles';
import type { DiscoveryTile } from './category-nav-types';

const TILES: DiscoveryTile[] = [
  {
    id: 'cvety-pcs',
    label: 'Цветы поштучно',
    href: '/catalog/stems',
    imageSrc: '/x.png',
    imageAlt: 'x',
  },
  {
    id: 'rozy',
    label: 'Букеты из роз',
    href: '/catalog/bouquets?flower=rozy',
    imageSrc: '/x.png',
    imageAlt: 'x',
  },
  {
    id: 'bukety',
    label: 'Букеты',
    href: '/catalog/bouquets',
    imageSrc: '/x.png',
    imageAlt: 'x',
  },
  {
    id: 'neveste',
    label: 'Невесте',
    href: '/komu/neveste',
    imageSrc: '/x.png',
    imageAlt: 'x',
  },
  {
    id: 'den-rozhdeniya',
    label: 'ДР',
    href: '/povod/den-rozhdeniya',
    imageSrc: '/x.png',
    imageAlt: 'x',
  },
  {
    id: 'kompozicii',
    label: 'Композиции',
    href: '/catalog/compositions',
    imageSrc: '/x.png',
    imageAlt: 'x',
  },
];

test('filterDiscoveryTiles keeps always-on catalog routes', () => {
  const empty = {
    flowerSlugs: new Set<string>(),
    recipientSlugs: new Set<string>(),
    occasionSlugs: new Set<string>(),
    catalogSlugs: new Set<string>(),
  };
  const filtered = filterDiscoveryTiles(TILES, empty);
  assert.ok(filtered.some((t) => t.href === '/catalog/stems'));
  assert.ok(filtered.some((t) => t.href === '/catalog/bouquets'));
  assert.ok(!filtered.some((t) => t.href === '/catalog/bouquets?flower=rozy'));
  assert.ok(!filtered.some((t) => t.href === '/komu/neveste'));
  assert.ok(!filtered.some((t) => t.href === '/povod/den-rozhdeniya'));
  assert.ok(!filtered.some((t) => t.href === '/catalog/compositions'));
});

test('filterDiscoveryTiles keeps taxonomy tiles when slugs exist', () => {
  const filtered = filterDiscoveryTiles(TILES, {
    flowerSlugs: new Set(['rozy']),
    recipientSlugs: new Set(['neveste']),
    occasionSlugs: new Set(['den-rozhdeniya']),
    catalogSlugs: new Set(['compositions']),
  });
  assert.ok(filtered.some((t) => t.id === 'rozy'));
  assert.ok(filtered.some((t) => t.id === 'neveste'));
  assert.ok(filtered.some((t) => t.id === 'den-rozhdeniya'));
  assert.ok(filtered.some((t) => t.id === 'kompozicii'));
});

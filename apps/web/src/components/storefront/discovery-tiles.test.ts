import assert from 'node:assert/strict';
import test from 'node:test';
import { filterDiscoveryTiles } from './discovery-tiles';
import type { DiscoveryTile } from './category-nav-types';

const TILES: DiscoveryTile[] = [
  {
    id: 'cvety-pcs',
    label: 'Цветы поштучно',
    href: '/cvety',
    imageSrc: '/x.png',
    imageAlt: 'x',
  },
  {
    id: 'rozy',
    label: 'Букеты из роз',
    href: '/cvety/rozy',
    imageSrc: '/x.png',
    imageAlt: 'x',
  },
  {
    id: 'bukety',
    label: 'Букеты',
    href: '/bukety',
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
];

test('filterDiscoveryTiles keeps always-on catalog routes', () => {
  const empty = {
    flowerSlugs: new Set<string>(),
    recipientSlugs: new Set<string>(),
    occasionSlugs: new Set<string>(),
  };
  const filtered = filterDiscoveryTiles(TILES, empty);
  assert.ok(filtered.some((t) => t.href === '/cvety'));
  assert.ok(filtered.some((t) => t.href === '/bukety'));
  assert.ok(!filtered.some((t) => t.href === '/cvety/rozy'));
  assert.ok(!filtered.some((t) => t.href === '/komu/neveste'));
  assert.ok(!filtered.some((t) => t.href === '/povod/den-rozhdeniya'));
});

test('filterDiscoveryTiles keeps taxonomy tiles when slugs exist', () => {
  const filtered = filterDiscoveryTiles(TILES, {
    flowerSlugs: new Set(['rozy']),
    recipientSlugs: new Set(['neveste']),
    occasionSlugs: new Set(['den-rozhdeniya']),
  });
  assert.ok(filtered.some((t) => t.id === 'rozy'));
  assert.ok(filtered.some((t) => t.id === 'neveste'));
  assert.ok(filtered.some((t) => t.id === 'den-rozhdeniya'));
});

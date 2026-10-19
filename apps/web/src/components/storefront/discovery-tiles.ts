import type { DiscoveryTile } from './category-nav-types';

export type { DiscoveryTile } from './category-nav-types';

/**
 * Keep tiles whose taxonomy / catalog-page targets exist
 * (or point at always-available hub routes). Avoids homepage 404 noise.
 */
export function filterDiscoveryTiles(
  tiles: DiscoveryTile[],
  available: {
    flowerSlugs: Set<string>;
    recipientSlugs: Set<string>;
    occasionSlugs: Set<string>;
    /** Published CatalogCategory / CatalogPage slugs for /katalog/:slug */
    catalogSlugs?: Set<string>;
  },
): DiscoveryTile[] {
  return tiles.filter((tile) => {
    const flower = tile.href.match(/^\/cvety\/([^/?#]+)/);
    if (flower) return available.flowerSlugs.has(decodeURIComponent(flower[1]!));
    const recipient = tile.href.match(/^\/komu\/([^/?#]+)/);
    if (recipient) return available.recipientSlugs.has(decodeURIComponent(recipient[1]!));
    const occasion = tile.href.match(/^\/povod\/([^/?#]+)/);
    if (occasion) return available.occasionSlugs.has(decodeURIComponent(occasion[1]!));
    const katalog = tile.href.match(/^\/katalog\/([^/?#]+)/);
    if (katalog && available.catalogSlugs) {
      return available.catalogSlugs.has(decodeURIComponent(katalog[1]!));
    }
    return true;
  });
}

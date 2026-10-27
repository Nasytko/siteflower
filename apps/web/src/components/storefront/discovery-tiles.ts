import { CATALOG_HUB_SLUG } from '@bouquet-one/contracts';
import type { DiscoveryTile } from './category-nav-types';

export type { DiscoveryTile } from './category-nav-types';

/** Primary hubs always linked; secondary catalog pages require an existing slug. */
const ALWAYS_ON_CATALOG_HREFS = new Set([
  '/catalog',
  `/catalog/${CATALOG_HUB_SLUG.BOUQUETS}`,
  `/catalog/${CATALOG_HUB_SLUG.STEMS}`,
]);

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
    /** Published CatalogCategory slugs for /catalog/:slug */
    catalogSlugs?: Set<string>;
  },
): DiscoveryTile[] {
  return tiles.filter((tile) => {
    const hrefPath = tile.href.split('?')[0] ?? tile.href;

    // Flower filter discovery URLs require the flower type slug to exist.
    const flowerFilter = tile.href.match(/[?&]flower=([^&#]+)/);
    if (flowerFilter && hrefPath.startsWith('/catalog/')) {
      return available.flowerSlugs.has(decodeURIComponent(flowerFilter[1]!));
    }
    const legacyFlower = tile.href.match(/^\/cvety\/([^/?#]+)/);
    if (legacyFlower) return available.flowerSlugs.has(decodeURIComponent(legacyFlower[1]!));

    if (ALWAYS_ON_CATALOG_HREFS.has(hrefPath)) return true;

    const recipient = tile.href.match(/^\/komu\/([^/?#]+)/);
    if (recipient) return available.recipientSlugs.has(decodeURIComponent(recipient[1]!));

    const occasion = tile.href.match(/^\/povod\/([^/?#]+)/);
    if (occasion) return available.occasionSlugs.has(decodeURIComponent(occasion[1]!));

    const catalog = tile.href.match(/^\/(?:katalog|catalog)\/([^/?#]+)/);
    if (catalog && available.catalogSlugs) {
      return available.catalogSlugs.has(decodeURIComponent(catalog[1]!));
    }
    return true;
  });
}

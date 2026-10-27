/**
 * Migrate persisted internal URLs from legacy Russian catalog paths
 * to the English canonical structure. External https:// links untouched.
 */

import { CATALOG_SLUG_ALIASES, canonicalCatalogSlug } from './public-routes';

const LEGACY_PRODUCT = /^\/bukety\/([^/?#]+)([?#].*)?$/i;
const LEGACY_KATALOG = /^\/katalog(?:\/([^/?#]+))?([?#].*)?$/i;
const LEGACY_CVETY_HUB = /^\/cvety\/?([?#].*)?$/i;
const LEGACY_CVETY_TYPE = /^\/cvety\/([^/?#]+)([?#].*)?$/i;
const LEGACY_BUKETY_HUB = /^\/bukety\/?([?#].*)?$/i;
const LEGACY_P = /^\/p\/([^/?#]+)([?#].*)?$/i;
const LEGACY_COLLECTIONS = /^\/collections(?:\/[^/?#]*)?([?#].*)?$/i;

/** Rewrite a single internal path; return null if unchanged or not applicable. */
export function migrateLegacyInternalHref(raw: string): string | null {
  const href = raw.trim();
  if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
    return null;
  }
  if (!href.startsWith('/')) return null;

  let m = href.match(LEGACY_PRODUCT);
  if (m) {
    return `/products/${encodeURIComponent(decodeURIComponent(m[1]!))}${m[2] ?? ''}`;
  }

  m = href.match(LEGACY_BUKETY_HUB);
  if (m) {
    return `/catalog/bouquets${m[1] ?? ''}`;
  }

  m = href.match(LEGACY_CVETY_TYPE);
  if (m) {
    const flower = encodeURIComponent(decodeURIComponent(m[1]!));
    const rest = m[2] ?? '';
    if (rest.startsWith('?')) {
      return `/catalog/bouquets?flower=${flower}&${rest.slice(1)}`;
    }
    if (rest.startsWith('#')) {
      return `/catalog/bouquets?flower=${flower}${rest}`;
    }
    return `/catalog/bouquets?flower=${flower}`;
  }

  m = href.match(LEGACY_CVETY_HUB);
  if (m) {
    return `/catalog/stems${m[1] ?? ''}`;
  }

  m = href.match(LEGACY_KATALOG);
  if (m) {
    const slug = m[1];
    const rest = m[2] ?? '';
    if (!slug) return `/catalog${rest}`;
    return `/catalog/${encodeURIComponent(canonicalCatalogSlug(decodeURIComponent(slug)))}${rest}`;
  }

  m = href.match(LEGACY_P);
  if (m) {
    const slug = canonicalCatalogSlug(decodeURIComponent(m[1]!));
    return `/catalog/${encodeURIComponent(slug)}${m[2] ?? ''}`;
  }

  m = href.match(LEGACY_COLLECTIONS);
  if (m) {
    return `/catalog/bouquets${m[1] ?? ''}`;
  }

  // Already under /catalog/{legacySlug}
  const catalogLeaf = href.match(/^\/catalog\/([^/?#]+)([?#].*)?$/i);
  if (catalogLeaf) {
    const decoded = decodeURIComponent(catalogLeaf[1]!);
    const canonical = canonicalCatalogSlug(decoded);
    if (canonical !== decoded && CATALOG_SLUG_ALIASES[decoded]) {
      return `/catalog/${encodeURIComponent(canonical)}${catalogLeaf[2] ?? ''}`;
    }
  }

  return null;
}

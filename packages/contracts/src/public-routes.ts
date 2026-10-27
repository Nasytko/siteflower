/**
 * Canonical public URL helpers for the storefront.
 * One product URL, one catalog page URL — no category nesting in product paths.
 */

/** Hub category slugs after English modernization. */
export const CATALOG_HUB_SLUG = {
  BOUQUETS: 'bouquets',
  STEMS: 'stems',
  COMPOSITIONS: 'compositions',
  GIFTS: 'gifts',
} as const;

/**
 * Known legacy CatalogCategory.slug → modern slug.
 * Applied by data migration + redirects; runtime helpers accept both during transition.
 */
export const CATALOG_SLUG_ALIASES: Readonly<Record<string, string>> = {
  bukety: CATALOG_HUB_SLUG.BOUQUETS,
  tsvety: CATALOG_HUB_SLUG.STEMS,
  cvety: CATALOG_HUB_SLUG.STEMS,
  kompozicii: CATALOG_HUB_SLUG.COMPOSITIONS,
  podarki: CATALOG_HUB_SLUG.GIFTS,
  rozy: 'roses',
  monobukety: 'mono-bouquets',
  'bukety-iz-roz': 'rose-bouquets',
  'bukety-s-rozami': 'bouquets-with-roses',
  'kustovye-rozy': 'spray-roses',
  'avtorskie-bukety': 'signature-bouquets',
  'smeshannye-bukety': 'mixed-bouquets',
};

/** Normalize a category slug to the modern canonical form when known. */
export function canonicalCatalogSlug(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed) return trimmed;
  return CATALOG_SLUG_ALIASES[trimmed] ?? CATALOG_SLUG_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/** Product detail — stable, category-independent. */
export function productPublicHref(slug: string): string {
  return `/products/${encodeURIComponent(slug)}`;
}

/** Catalog index. */
export function catalogIndexHref(): string {
  return '/catalog';
}

/** Catalog hub or thematic page. */
export function catalogPublicHref(slug: string): string {
  const canonical = canonicalCatalogSlug(slug);
  return `/catalog/${encodeURIComponent(canonical)}`;
}

/**
 * @deprecated Use catalogPublicHref. Kept as alias during cutover.
 * Previously returned /bukety, /cvety, or /katalog/{slug}.
 */
export function categoryPublicHref(slug: string): string {
  return catalogPublicHref(slug);
}

/** Flower-type discovery → bouquets filtered by type (not a separate SEO tree). */
export function flowerTypeDiscoveryHref(flowerTypeSlug: string): string {
  const q = new URLSearchParams({ flower: flowerTypeSlug });
  return `${catalogPublicHref(CATALOG_HUB_SLUG.BOUQUETS)}?${q.toString()}`;
}

/** Occasion discovery → bouquets filtered by occasion. */
export function occasionDiscoveryHref(occasionSlug: string): string {
  return `/povod/${encodeURIComponent(occasionSlug)}`;
}

/** Recipient discovery. */
export function recipientDiscoveryHref(recipientSlug: string): string {
  return `/komu/${encodeURIComponent(recipientSlug)}`;
}

/** Permanent redirect map for Next.js / ops (legacy path → canonical). */
export const LEGACY_PATH_REDIRECTS: ReadonlyArray<{
  source: string;
  destination: string;
  permanent: true;
}> = [
  { source: '/bukety', destination: '/catalog/bouquets', permanent: true },
  { source: '/bukety/:slug', destination: '/products/:slug', permanent: true },
  { source: '/katalog', destination: '/catalog', permanent: true },
  { source: '/katalog/:slug', destination: '/catalog/:slug', permanent: true },
  { source: '/cvety', destination: '/catalog/stems', permanent: true },
  { source: '/cvety/:slug', destination: '/catalog/bouquets?flower=:slug', permanent: true },
  { source: '/p/:slug', destination: '/catalog/:slug', permanent: true },
  { source: '/collections', destination: '/catalog/bouquets', permanent: true },
  { source: '/collections/:slug', destination: '/catalog/bouquets', permanent: true },
];

/**
 * Product shelf data sources for homepage sections.
 * Independent from the «Смотреть все» link destination.
 */

import { catalogPublicHref } from './public-routes';

export const CATALOG_SOURCE_KINDS = [
  'auto',
  'promotions',
  'catalog_page',
  'bestseller_group',
] as const;
export type CatalogSourceKind = (typeof CATALOG_SOURCE_KINDS)[number];

export type CatalogSourceDto = {
  kind: CatalogSourceKind;
  /** Catalog page / bestseller group id when kind needs it. */
  id?: string | null;
  /** Denormalized slug for runtime listing (kept in sync on save). */
  slug?: string | null;
};

export type CatalogSourceResolveContext = {
  slugById?: ReadonlyMap<string, string> | Record<string, string>;
};

function mapGet(
  map: ReadonlyMap<string, string> | Record<string, string> | undefined,
  id: string,
): string | undefined {
  if (!map) return undefined;
  if (map instanceof Map) return map.get(id);
  const record = map as Record<string, string>;
  return Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined;
}

export function isCatalogSourceKind(value: string): value is CatalogSourceKind {
  return (CATALOG_SOURCE_KINDS as readonly string[]).includes(value);
}

/** Resolve listing slug written to HomepageSectionDto.sourceSlug. */
export function resolveCatalogSourceSlug(
  source: CatalogSourceDto | null | undefined,
  fallbackSlug?: string | null,
  ctx?: CatalogSourceResolveContext,
): string | null {
  if (!source || source.kind === 'auto' || source.kind === 'promotions') {
    return null;
  }
  const id = source.id?.trim() ?? '';
  if (id) {
    const fromId = mapGet(ctx?.slugById, id);
    if (fromId) return fromId;
  }
  const slug = (source.slug ?? fallbackSlug ?? '').trim();
  return slug || null;
}

/** Default «Смотреть все» path from a source (when view-all mode is automatic). */
export function catalogSourceDefaultViewAllHref(
  source: CatalogSourceDto | null | undefined,
  fallbackSlug?: string | null,
): string | null {
  if (!source) {
    const slug = (fallbackSlug ?? '').trim();
    return slug ? catalogPublicHref(slug) : null;
  }
  if (source.kind === 'promotions') return '/akcii';
  if (source.kind === 'auto') return null;
  const slug = (source.slug ?? fallbackSlug ?? '').trim();
  if (!slug) return null;
  if (source.kind === 'bestseller_group') {
    return `${catalogPublicHref('bouquets')}?bestseller=${encodeURIComponent(slug)}`;
  }
  return catalogPublicHref(slug);
}

export function inferCatalogSourceFromSlug(
  sourceSlug: string | null | undefined,
  sectionKind?: string,
): CatalogSourceDto {
  if (sectionKind === 'promotions') {
    return { kind: 'promotions', id: null, slug: null };
  }
  const slug = (sourceSlug ?? '').trim();
  if (!slug) return { kind: 'auto', id: null, slug: null };
  // Slug alone cannot distinguish page vs bestseller — treat as catalog_page until admin re-picks.
  return { kind: 'catalog_page', id: null, slug };
}

export function normalizeCatalogSource(
  value: unknown,
  fallbackSlug?: string | null,
  sectionKind?: string,
): CatalogSourceDto | null {
  if (!value || typeof value !== 'object') {
    return inferCatalogSourceFromSlug(fallbackSlug, sectionKind);
  }
  const raw = value as Record<string, unknown>;
  const kind =
    typeof raw.kind === 'string' && isCatalogSourceKind(raw.kind) ? raw.kind : null;
  if (!kind) return inferCatalogSourceFromSlug(fallbackSlug, sectionKind);
  return {
    kind,
    id: typeof raw.id === 'string' ? raw.id : raw.id === null ? null : undefined,
    slug: typeof raw.slug === 'string' ? raw.slug : raw.slug === null ? null : undefined,
  };
}

/**
 * Stable link destinations for CMS fields (homepage, nav, etc.).
 * Prefer entity ids / system keys over raw URL strings; resolve to href on save.
 */

import {
  catalogIndexHref,
  catalogPublicHref,
  productPublicHref,
} from './public-routes';

export const LINK_DESTINATION_KINDS = [
  'system',
  'catalog_page',
  'category',
  'product',
  'custom',
] as const;
export type LinkDestinationKind = (typeof LINK_DESTINATION_KINDS)[number];

export const SYSTEM_ROUTE_KEYS = [
  'home',
  'catalog',
  'bouquets',
  'stems',
  'promotions',
  'about',
  'delivery',
  'contacts',
] as const;
export type SystemRouteKey = (typeof SYSTEM_ROUTE_KEYS)[number];

export type LinkDestinationDto = {
  kind: LinkDestinationKind;
  /** System key, or catalog/product entity id. */
  ref?: string | null;
  /**
   * Custom / external URL, or denormalized snapshot used when lookup is unavailable.
   * Absolute http(s) for external; site-relative path for custom internal.
   */
  href?: string | null;
};

export type LinkDestinationResolveContext = {
  /** id → public slug for catalog pages / categories */
  catalogSlugById?: ReadonlyMap<string, string> | Record<string, string>;
  /** id → public product slug */
  productSlugById?: ReadonlyMap<string, string> | Record<string, string>;
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

export function isSystemRouteKey(value: string): value is SystemRouteKey {
  return (SYSTEM_ROUTE_KEYS as readonly string[]).includes(value);
}

export function isLinkDestinationKind(value: string): value is LinkDestinationKind {
  return (LINK_DESTINATION_KINDS as readonly string[]).includes(value);
}

export function systemRouteHref(key: SystemRouteKey): string {
  switch (key) {
    case 'home':
      return '/';
    case 'catalog':
      return catalogIndexHref();
    case 'bouquets':
      return catalogPublicHref('bouquets');
    case 'stems':
      return catalogPublicHref('stems');
    case 'promotions':
      return '/akcii';
    case 'about':
      return '/o-nas';
    case 'delivery':
      return '/dostavka';
    case 'contacts':
      return '/kontakty';
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

/** Validate custom/external href (frontend + server). */
export function validateCustomHref(href: string): { ok: true } | { ok: false; message: string } {
  const trimmed = href.trim();
  if (!trimmed) return { ok: false, message: 'Укажите URL' };
  if (trimmed.length > 500) return { ok: false, message: 'URL слишком длинный' };
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) {
      return { ok: false, message: 'Protocol-relative URL не допускается' };
    }
    return { ok: true };
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, message: 'Допустимы только http(s) или путь сайта' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Некорректный URL' };
  }
}

/**
 * Resolve a destination to a storefront href.
 * Falls back to stored href snapshot when entity slug is missing.
 */
export function resolveLinkDestinationHref(
  destination: LinkDestinationDto | null | undefined,
  fallbackHref?: string | null,
  ctx?: LinkDestinationResolveContext,
): string {
  if (!destination) {
    return (fallbackHref ?? '').trim() || '/';
  }

  switch (destination.kind) {
    case 'system': {
      const key = destination.ref?.trim() ?? '';
      if (isSystemRouteKey(key)) return systemRouteHref(key);
      return (destination.href ?? fallbackHref ?? '/').trim() || '/';
    }
    case 'catalog_page':
    case 'category': {
      const id = destination.ref?.trim() ?? '';
      const slug = id ? mapGet(ctx?.catalogSlugById, id) : undefined;
      if (slug) return catalogPublicHref(slug);
      const snap = (destination.href ?? fallbackHref ?? '').trim();
      return snap || catalogIndexHref();
    }
    case 'product': {
      const id = destination.ref?.trim() ?? '';
      const slug = id ? mapGet(ctx?.productSlugById, id) : undefined;
      if (slug) return productPublicHref(slug);
      const snap = (destination.href ?? fallbackHref ?? '').trim();
      return snap || catalogIndexHref();
    }
    case 'custom': {
      const href = (destination.href ?? fallbackHref ?? '').trim();
      const check = validateCustomHref(href || '/');
      return check.ok ? href || '/' : (fallbackHref ?? '/').trim() || '/';
    }
    default:
      return (fallbackHref ?? '/').trim() || '/';
  }
}

/** Best-effort reverse parse of a stored href into a destination (migration / dual-read). */
export function inferLinkDestinationFromHref(href: string): LinkDestinationDto {
  const trimmed = href.trim();
  if (!trimmed) return { kind: 'system', ref: 'home', href: '/' };

  for (const key of SYSTEM_ROUTE_KEYS) {
    if (systemRouteHref(key) === trimmed) {
      return { kind: 'system', ref: key, href: trimmed };
    }
  }

  const productMatch = trimmed.match(/^\/products\/([^/?#]+)/);
  if (productMatch?.[1]) {
    return {
      kind: 'custom',
      href: trimmed,
    };
  }

  const catalogMatch = trimmed.match(/^\/catalog\/([^/?#]+)/);
  if (catalogMatch?.[1]) {
    // Keep as custom path until admin re-picks a stable id (slug alone is not an id).
    return { kind: 'custom', href: trimmed };
  }

  if (trimmed.startsWith('/')) {
    return { kind: 'custom', href: trimmed };
  }

  return { kind: 'custom', href: trimmed };
}

export function normalizeLinkDestination(
  value: unknown,
  fallbackHref?: string | null,
): LinkDestinationDto | null {
  if (!value || typeof value !== 'object') {
    if (fallbackHref && fallbackHref.trim()) {
      return inferLinkDestinationFromHref(fallbackHref);
    }
    return null;
  }
  const raw = value as Record<string, unknown>;
  const kind = typeof raw.kind === 'string' && isLinkDestinationKind(raw.kind) ? raw.kind : null;
  if (!kind) {
    if (fallbackHref && fallbackHref.trim()) return inferLinkDestinationFromHref(fallbackHref);
    return null;
  }
  return {
    kind,
    ref: typeof raw.ref === 'string' ? raw.ref : raw.ref === null ? null : undefined,
    href: typeof raw.href === 'string' ? raw.href : raw.href === null ? null : undefined,
  };
}

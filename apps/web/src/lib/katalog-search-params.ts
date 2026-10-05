/**
 * Shareable URL state for /katalog/[slug] flower category PLPs.
 */

import {
  isHeightBandId,
  isProductSort,
  type CatalogFilterKey,
  type HeightBandId,
  type ProductSort,
} from '@bouquet-one/contracts';
import type { CatalogListParams } from '@/lib/public-api';
import {
  DEFAULT_PRODUCT_SORT,
  joinSlugList,
  parseSlugListParam,
} from '@/lib/catalog-search-params';

export { toggleSlug, bouquetCountLabel } from '@/lib/catalog-search-params';

export const KATALOG_PAGE_SIZE = 24;

export type KatalogSearchState = {
  /** FlowerType slugs — filter "Цветы" (not Color). */
  flowerTypes: string[];
  varieties: string[];
  colors: string[];
  /** Single stem-height band id (HEIGHT_BANDS → FlowerItem.heightCm). */
  height: HeightBandId | null;
  origins: string[];
  occasions: string[];
  recipients: string[];
  sizes: string[];
  /** Only products with an active promotion. */
  promo: boolean;
  sort: ProductSort;
  search?: string;
  page: number;
};

export const KATALOG_QUERY_KEYS = {
  flowerTypes: 'flower',
  varieties: 'var',
  colors: 'color',
  height: 'h',
  origins: 'orig',
  occasions: 'occasion',
  recipients: 'recipient',
  sizes: 'size',
  promo: 'promo',
} as const;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

export function emptyKatalogSearchState(): KatalogSearchState {
  return {
    flowerTypes: [],
    varieties: [],
    colors: [],
    height: null,
    origins: [],
    occasions: [],
    recipients: [],
    sizes: [],
    promo: false,
    sort: DEFAULT_PRODUCT_SORT,
    page: 1,
  };
}

/**
 * Drop filter facets that are not enabled for this category's Filter Pool config.
 * Sort, search, and page are never gated.
 */
export function gateKatalogSearchState(
  state: KatalogSearchState,
  enabledKeys: readonly CatalogFilterKey[],
): KatalogSearchState {
  const keys = new Set(enabledKeys);
  return {
    ...state,
    flowerTypes: keys.has('flower_type') ? state.flowerTypes : [],
    varieties: keys.has('variety') ? state.varieties : [],
    colors: keys.has('color') ? state.colors : [],
    height: keys.has('stem_height') ? state.height : null,
    origins: keys.has('origin') ? state.origins : [],
    occasions: keys.has('occasion') ? state.occasions : [],
    recipients: keys.has('recipient') ? state.recipients : [],
    sizes: keys.has('bouquet_size') ? state.sizes : [],
    promo: keys.has('promo') ? state.promo : false,
  };
}

export function parseKatalogSearchParams(
  raw: Record<string, string | string[] | undefined>,
): KatalogSearchState {
  const sortRaw = firstParam(raw.sort);
  const sort: ProductSort =
    sortRaw && isProductSort(sortRaw) ? sortRaw : DEFAULT_PRODUCT_SORT;
  const pageRaw = firstParam(raw.page);
  const pageNum = pageRaw && /^\d+$/.test(pageRaw) ? Number(pageRaw) : 1;
  const heightRaw = firstParam(raw[KATALOG_QUERY_KEYS.height]);
  const height = heightRaw && isHeightBandId(heightRaw) ? heightRaw : null;

  const promoRaw = firstParam(raw[KATALOG_QUERY_KEYS.promo]);
  return {
    flowerTypes: parseSlugListParam(raw[KATALOG_QUERY_KEYS.flowerTypes]),
    varieties: parseSlugListParam(raw[KATALOG_QUERY_KEYS.varieties]),
    colors: parseSlugListParam(raw[KATALOG_QUERY_KEYS.colors]),
    height,
    origins: parseSlugListParam(raw[KATALOG_QUERY_KEYS.origins]),
    occasions: parseSlugListParam(raw[KATALOG_QUERY_KEYS.occasions]),
    recipients: parseSlugListParam(raw[KATALOG_QUERY_KEYS.recipients]),
    sizes: parseSlugListParam(raw[KATALOG_QUERY_KEYS.sizes]),
    promo: promoRaw === '1' || promoRaw === 'true',
    sort,
    search: firstParam(raw.q) ?? firstParam(raw.search),
    page: pageNum > 0 ? pageNum : 1,
  };
}

export function katalogStateToListParams(
  categorySlug: string,
  state: KatalogSearchState,
): CatalogListParams {
  return {
    page: state.page,
    pageSize: KATALOG_PAGE_SIZE,
    search: state.search,
    categorySlug,
    flowerTypeSlug: joinSlugList(state.flowerTypes),
    flowerVarietySlug: joinSlugList(state.varieties),
    color: joinSlugList(state.colors),
    flowerOriginSlug: joinSlugList(state.origins),
    occasion: joinSlugList(state.occasions),
    recipient: joinSlugList(state.recipients),
    size: joinSlugList(state.sizes),
    heightBand: state.height ?? undefined,
    promotion: state.promo || undefined,
    sort: state.sort,
  };
}

export function katalogHasActiveFilters(state: KatalogSearchState): boolean {
  return (
    state.flowerTypes.length > 0 ||
    state.varieties.length > 0 ||
    state.colors.length > 0 ||
    state.origins.length > 0 ||
    state.occasions.length > 0 ||
    state.recipients.length > 0 ||
    state.sizes.length > 0 ||
    state.height != null ||
    state.promo ||
    Boolean(state.search)
  );
}

export function katalogStateToQuery(state: Partial<KatalogSearchState>): string {
  const params = new URLSearchParams();

  const flowerJoined = joinSlugList(state.flowerTypes);
  if (flowerJoined) params.set(KATALOG_QUERY_KEYS.flowerTypes, flowerJoined);

  const varietyJoined = joinSlugList(state.varieties);
  if (varietyJoined) params.set(KATALOG_QUERY_KEYS.varieties, varietyJoined);

  const colorJoined = joinSlugList(state.colors);
  if (colorJoined) params.set(KATALOG_QUERY_KEYS.colors, colorJoined);

  const originJoined = joinSlugList(state.origins);
  if (originJoined) params.set(KATALOG_QUERY_KEYS.origins, originJoined);

  const occasionJoined = joinSlugList(state.occasions);
  if (occasionJoined) params.set(KATALOG_QUERY_KEYS.occasions, occasionJoined);

  const recipientJoined = joinSlugList(state.recipients);
  if (recipientJoined) params.set(KATALOG_QUERY_KEYS.recipients, recipientJoined);

  const sizeJoined = joinSlugList(state.sizes);
  if (sizeJoined) params.set(KATALOG_QUERY_KEYS.sizes, sizeJoined);

  if (state.height) params.set(KATALOG_QUERY_KEYS.height, state.height);
  if (state.promo) params.set(KATALOG_QUERY_KEYS.promo, '1');

  const entries: Array<[string, string | undefined]> = [
    ['sort', state.sort && state.sort !== DEFAULT_PRODUCT_SORT ? state.sort : undefined],
    ['q', state.search],
    ['page', state.page && state.page > 1 ? String(state.page) : undefined],
  ];
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function katalogHref(
  categorySlug: string,
  state: KatalogSearchState,
  patch: Partial<KatalogSearchState> = {},
): string {
  return `/katalog/${encodeURIComponent(categorySlug)}${katalogStateToQuery({
    ...state,
    ...patch,
    page: patch.page ?? 1,
  })}`;
}

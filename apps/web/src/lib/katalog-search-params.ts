/**
 * Shareable URL state for /katalog/[slug] flower category PLPs.
 */

import { isHeightBandId, isProductSort, type HeightBandId, type ProductSort } from '@bouquet-one/contracts';
import type { CatalogListParams } from '@/lib/public-api';
import {
  DEFAULT_PRODUCT_SORT,
  joinSlugList,
  parseSlugListParam,
} from '@/lib/catalog-search-params';

export { toggleSlug, bouquetCountLabel } from '@/lib/catalog-search-params';

export const KATALOG_PAGE_SIZE = 24;

export type KatalogSearchState = {
  varieties: string[];
  colors: string[];
  /** Single height band id (HEIGHT_BANDS). */
  height: HeightBandId | null;
  origins: string[];
  sort: ProductSort;
  search?: string;
  page: number;
};

export const KATALOG_QUERY_KEYS = {
  varieties: 'var',
  colors: 'color',
  height: 'h',
  origins: 'orig',
} as const;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

export function emptyKatalogSearchState(): KatalogSearchState {
  return {
    varieties: [],
    colors: [],
    height: null,
    origins: [],
    sort: DEFAULT_PRODUCT_SORT,
    page: 1,
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

  return {
    varieties: parseSlugListParam(raw[KATALOG_QUERY_KEYS.varieties]),
    colors: parseSlugListParam(raw[KATALOG_QUERY_KEYS.colors]),
    height,
    origins: parseSlugListParam(raw[KATALOG_QUERY_KEYS.origins]),
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
    flowerVarietySlug: joinSlugList(state.varieties),
    color: joinSlugList(state.colors),
    flowerOriginSlug: joinSlugList(state.origins),
    heightBand: state.height ?? undefined,
    sort: state.sort,
  };
}

export function katalogHasActiveFilters(state: KatalogSearchState): boolean {
  return (
    state.varieties.length > 0 ||
    state.colors.length > 0 ||
    state.origins.length > 0 ||
    state.height != null ||
    Boolean(state.search)
  );
}

export function katalogStateToQuery(state: Partial<KatalogSearchState>): string {
  const params = new URLSearchParams();

  const varietyJoined = joinSlugList(state.varieties);
  if (varietyJoined) params.set(KATALOG_QUERY_KEYS.varieties, varietyJoined);

  const colorJoined = joinSlugList(state.colors);
  if (colorJoined) params.set(KATALOG_QUERY_KEYS.colors, colorJoined);

  const originJoined = joinSlugList(state.origins);
  if (originJoined) params.set(KATALOG_QUERY_KEYS.origins, originJoined);

  if (state.height) params.set(KATALOG_QUERY_KEYS.height, state.height);

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

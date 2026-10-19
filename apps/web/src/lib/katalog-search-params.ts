/**
 * Shareable URL state for /katalog/[slug] flower category PLPs.
 */

import {
  isCompositionKind,
  isHeightBandId,
  isProductSort,
  type CatalogFilterKey,
  type CompositionKind,
  type HeightBandId,
  type ProductSort,
} from '@bouquet-one/contracts';
import type { CatalogListParams } from '@/lib/public-api';
import {
  DEFAULT_PRODUCT_SORT,
  joinSlugList,
  parseSlugListParam,
} from '@/lib/catalog-search-params';

export {
  toggleSlug,
  bouquetCountLabel,
  catalogCountLabel,
} from '@/lib/catalog-search-params';

export const KATALOG_PAGE_SIZE = 24;

export type KatalogSearchState = {
  /** FlowerType slugs — filter "Цветы" (not Color). */
  flowerTypes: string[];
  varieties: string[];
  /** Product-level visual palette. */
  colors: string[];
  /** Composition-line colors (same-component AND with flower type). */
  componentColors: string[];
  compositionKinds: CompositionKind[];
  /** Single stem-height band id (HEIGHT_BANDS → FlowerItem.heightCm). */
  height: HeightBandId | null;
  origins: string[];
  occasions: string[];
  recipients: string[];
  /** Only products with an active promotion. */
  promo: boolean;
  minPriceMinor?: string;
  maxPriceMinor?: string;
  /** Min PRIMARY qty for first selected flower type (EXACT compositions). */
  minQty?: number;
  sort: ProductSort;
  search?: string;
  page: number;
};

export const KATALOG_QUERY_KEYS = {
  flowerTypes: 'flower',
  varieties: 'var',
  colors: 'color',
  componentColors: 'ccolor',
  compositionKinds: 'kind',
  height: 'h',
  origins: 'orig',
  occasions: 'occasion',
  recipients: 'recipient',
  promo: 'promo',
  minPrice: 'min',
  maxPrice: 'max',
  minQty: 'qty',
} as const;

const KIND_SLUG_TO_ENUM: Record<string, CompositionKind> = {
  mono: 'MONO',
  mixed: 'MIXED',
  unknown: 'UNKNOWN',
  MONO: 'MONO',
  MIXED: 'MIXED',
  UNKNOWN: 'UNKNOWN',
};

const KIND_ENUM_TO_SLUG: Record<CompositionKind, string> = {
  MONO: 'mono',
  MIXED: 'mixed',
  UNKNOWN: 'unknown',
};

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

function parseCompositionKinds(raw: string | string[] | undefined): CompositionKind[] {
  const slugs = parseSlugListParam(raw);
  const out: CompositionKind[] = [];
  for (const slug of slugs) {
    const kind = KIND_SLUG_TO_ENUM[slug] ?? (isCompositionKind(slug) ? slug : null);
    if (kind && !out.includes(kind)) out.push(kind);
  }
  return out;
}

export function emptyKatalogSearchState(): KatalogSearchState {
  return {
    flowerTypes: [],
    varieties: [],
    colors: [],
    componentColors: [],
    compositionKinds: [],
    height: null,
    origins: [],
    occasions: [],
    recipients: [],
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
    componentColors: keys.has('color') ? state.componentColors : [],
    compositionKinds: keys.has('composition_kind') ? state.compositionKinds : [],
    height: keys.has('stem_height') ? state.height : null,
    origins: keys.has('origin') ? state.origins : [],
    occasions: keys.has('occasion') ? state.occasions : [],
    recipients: keys.has('recipient') ? state.recipients : [],
    promo: keys.has('promo') ? state.promo : false,
    minPriceMinor: keys.has('price') ? state.minPriceMinor : undefined,
    maxPriceMinor: keys.has('price') ? state.maxPriceMinor : undefined,
    minQty: keys.has('quantity') ? state.minQty : undefined,
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
  const qtyRaw = firstParam(raw[KATALOG_QUERY_KEYS.minQty]);
  const minQty = qtyRaw && /^\d+$/.test(qtyRaw) ? Number(qtyRaw) : undefined;

  return {
    flowerTypes: parseSlugListParam(raw[KATALOG_QUERY_KEYS.flowerTypes]),
    varieties: parseSlugListParam(raw[KATALOG_QUERY_KEYS.varieties]),
    colors: parseSlugListParam(raw[KATALOG_QUERY_KEYS.colors]),
    componentColors: parseSlugListParam(raw[KATALOG_QUERY_KEYS.componentColors]),
    compositionKinds: parseCompositionKinds(raw[KATALOG_QUERY_KEYS.compositionKinds]),
    height,
    origins: parseSlugListParam(raw[KATALOG_QUERY_KEYS.origins]),
    occasions: parseSlugListParam(raw[KATALOG_QUERY_KEYS.occasions]),
    recipients: parseSlugListParam(raw[KATALOG_QUERY_KEYS.recipients]),
    promo: promoRaw === '1' || promoRaw === 'true',
    minPriceMinor: firstParam(raw[KATALOG_QUERY_KEYS.minPrice]),
    maxPriceMinor: firstParam(raw[KATALOG_QUERY_KEYS.maxPrice]),
    minQty: minQty && minQty > 0 ? minQty : undefined,
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
    componentColor: joinSlugList(state.componentColors),
    compositionKind: joinSlugList(state.compositionKinds.map((k) => KIND_ENUM_TO_SLUG[k])),
    flowerOriginSlug: joinSlugList(state.origins),
    occasion: joinSlugList(state.occasions),
    recipient: joinSlugList(state.recipients),
    heightBand: state.height ?? undefined,
    promotion: state.promo || undefined,
    minPriceMinor: state.minPriceMinor,
    maxPriceMinor: state.maxPriceMinor,
    minFlowerTypeQuantity: state.minQty,
    flowerTypeQuantitySlug: state.minQty ? state.flowerTypes[0] : undefined,
    sort: state.sort,
  };
}

export function katalogHasActiveFilters(state: KatalogSearchState): boolean {
  return (
    state.flowerTypes.length > 0 ||
    state.varieties.length > 0 ||
    state.colors.length > 0 ||
    state.componentColors.length > 0 ||
    state.compositionKinds.length > 0 ||
    state.origins.length > 0 ||
    state.occasions.length > 0 ||
    state.recipients.length > 0 ||
    state.height != null ||
    state.promo ||
    Boolean(state.minPriceMinor) ||
    Boolean(state.maxPriceMinor) ||
    Boolean(state.minQty) ||
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

  const componentColorJoined = joinSlugList(state.componentColors);
  if (componentColorJoined) params.set(KATALOG_QUERY_KEYS.componentColors, componentColorJoined);

  const kindJoined = joinSlugList(
    (state.compositionKinds ?? []).map((k) => KIND_ENUM_TO_SLUG[k]),
  );
  if (kindJoined) params.set(KATALOG_QUERY_KEYS.compositionKinds, kindJoined);

  const originJoined = joinSlugList(state.origins);
  if (originJoined) params.set(KATALOG_QUERY_KEYS.origins, originJoined);

  const occasionJoined = joinSlugList(state.occasions);
  if (occasionJoined) params.set(KATALOG_QUERY_KEYS.occasions, occasionJoined);

  const recipientJoined = joinSlugList(state.recipients);
  if (recipientJoined) params.set(KATALOG_QUERY_KEYS.recipients, recipientJoined);

  if (state.height) params.set(KATALOG_QUERY_KEYS.height, state.height);
  if (state.promo) params.set(KATALOG_QUERY_KEYS.promo, '1');
  if (state.minPriceMinor) params.set(KATALOG_QUERY_KEYS.minPrice, state.minPriceMinor);
  if (state.maxPriceMinor) params.set(KATALOG_QUERY_KEYS.maxPrice, state.maxPriceMinor);
  if (state.minQty) params.set(KATALOG_QUERY_KEYS.minQty, String(state.minQty));

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

/**
 * Shareable catalog URL state for /bukety.
 *
 * Five customer-facing dimensions only: budget, occasion, recipient, color,
 * flower, bouquet size (+ sort / page / free-text search).
 * Semantics: AND across dimensions, OR within a dimension.
 */

import { isProductSort, type ProductSort } from '@bouquet-one/contracts';
import type { CatalogListParams } from '@/lib/public-api';

export const DEFAULT_PRODUCT_SORT: ProductSort = 'recommended';
export const CATALOG_PAGE_SIZE = 24;

export type CatalogSearchState = {
  /** BudgetRange ids (Admin-managed), not raw prices. */
  budgets: string[];
  occasions: string[];
  recipients: string[];
  colors: string[];
  flowers: string[];
  /** BouquetSize slugs. */
  sizes: string[];
  sort: ProductSort;
  search?: string;
  page: number;
};

/** URL keys per dimension — single source of truth for parse/serialize. */
export const CATALOG_DIMENSION_PARAMS = {
  budgets: 'budget',
  occasions: 'occasion',
  recipients: 'recipient',
  colors: 'color',
  flowers: 'flower',
  sizes: 'size',
} as const satisfies Record<CatalogDimension, string>;

export type CatalogDimension =
  | 'budgets'
  | 'occasions'
  | 'recipients'
  | 'colors'
  | 'flowers'
  | 'sizes';

export const CATALOG_DIMENSIONS: CatalogDimension[] = [
  'budgets',
  'occasions',
  'recipients',
  'colors',
  'flowers',
  'sizes',
];

const LIST_MAX = 16;

export function emptyCatalogSearchState(): CatalogSearchState {
  return {
    budgets: [],
    occasions: [],
    recipients: [],
    colors: [],
    flowers: [],
    sizes: [],
    sort: DEFAULT_PRODUCT_SORT,
    page: 1,
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

/** Accept `a,b` or repeated `?color=a&color=b`. */
export function parseSlugListParam(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value.join(',') : value;
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 120);
  return [...new Set(parts)].slice(0, LIST_MAX);
}

export function joinSlugList(slugs: string[] | undefined): string | undefined {
  if (!slugs || slugs.length === 0) return undefined;
  return slugs.join(',');
}

export function toggleSlug(list: string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((item) => item !== slug) : [...list, slug];
}

export function parseCatalogSearchParams(
  raw: Record<string, string | string[] | undefined>,
): CatalogSearchState {
  const sortRaw = firstParam(raw.sort);
  const sort: ProductSort =
    sortRaw && isProductSort(sortRaw) ? sortRaw : DEFAULT_PRODUCT_SORT;
  const pageRaw = firstParam(raw.page);
  const pageNum = pageRaw && /^\d+$/.test(pageRaw) ? Number(pageRaw) : 1;

  return {
    budgets: parseSlugListParam(raw[CATALOG_DIMENSION_PARAMS.budgets]),
    occasions: parseSlugListParam(raw[CATALOG_DIMENSION_PARAMS.occasions]),
    recipients: parseSlugListParam(raw[CATALOG_DIMENSION_PARAMS.recipients]),
    colors: parseSlugListParam(raw[CATALOG_DIMENSION_PARAMS.colors]),
    flowers: parseSlugListParam(raw[CATALOG_DIMENSION_PARAMS.flowers]),
    sizes: parseSlugListParam(raw[CATALOG_DIMENSION_PARAMS.sizes]),
    sort,
    search: firstParam(raw.q) ?? firstParam(raw.search),
    page: pageNum > 0 ? pageNum : 1,
  };
}

export function catalogStateToListParams(state: CatalogSearchState): CatalogListParams {
  return {
    page: state.page,
    pageSize: CATALOG_PAGE_SIZE,
    search: state.search,
    budget: joinSlugList(state.budgets),
    occasion: joinSlugList(state.occasions),
    recipient: joinSlugList(state.recipients),
    color: joinSlugList(state.colors),
    flower: joinSlugList(state.flowers),
    size: joinSlugList(state.sizes),
    sort: state.sort,
  };
}

export function catalogHasActiveFilters(state: CatalogSearchState): boolean {
  return (
    CATALOG_DIMENSIONS.some((dimension) => state[dimension].length > 0) || Boolean(state.search)
  );
}

export function catalogActiveFilterCount(state: CatalogSearchState): number {
  let count = CATALOG_DIMENSIONS.reduce((sum, dimension) => sum + state[dimension].length, 0);
  if (state.search) count += 1;
  return count;
}

export function catalogStateToQuery(state: Partial<CatalogSearchState>): string {
  const params = new URLSearchParams();

  for (const dimension of CATALOG_DIMENSIONS) {
    const joined = joinSlugList(state[dimension]);
    if (joined) params.set(CATALOG_DIMENSION_PARAMS[dimension], joined);
  }

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

/** Absolute catalog href for a patched state; any filter change resets paging. */
export function catalogHref(
  state: CatalogSearchState,
  patch: Partial<CatalogSearchState> = {},
): string {
  return `/bukety${catalogStateToQuery({ ...state, ...patch, page: patch.page ?? 1 })}`;
}

export const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: 'recommended', label: 'Рекомендуемые' },
  { value: 'price_asc', label: 'Сначала дешевле' },
  { value: 'price_desc', label: 'Сначала дороже' },
  { value: 'newest', label: 'Новинки' },
];

/** "Найдено 12 букетов" — Russian plural agreement. */
export function bouquetCountLabel(total: number): string {
  const mod100 = total % 100;
  const mod10 = total % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${total} букетов`;
  if (mod10 === 1) return `${total} букет`;
  if (mod10 >= 2 && mod10 <= 4) return `${total} букета`;
  return `${total} букетов`;
}

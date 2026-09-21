import { isProductSort, type ProductSort } from '@bouquet-one/contracts';
import { PRICE_BANDS } from '@/lib/media';
import type { CatalogListParams } from '@/lib/public-api';

export type CatalogSearchState = {
  flower?: string;
  color?: string;
  style?: string;
  category?: string;
  occasion?: string;
  recipient?: string;
  /** Customer-facing major BYN units as integer string, e.g. "150" */
  minPrice?: string;
  maxPrice?: string;
  band?: string;
  sort: ProductSort;
  search?: string;
  page: number;
};

/** Convert whole BYN major units to minor units as a decimal-free integer string. */
export function majorBynToMinor(major: string | undefined | null): string | undefined {
  if (!major) return undefined;
  const trimmed = major.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  return (BigInt(trimmed) * 100n).toString();
}

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

export function parseCatalogSearchParams(
  raw: Record<string, string | string[] | undefined>,
): CatalogSearchState {
  const sortRaw = firstParam(raw.sort);
  const sort: ProductSort = sortRaw && isProductSort(sortRaw) ? sortRaw : 'featured';
  const pageRaw = firstParam(raw.page);
  const pageNum = pageRaw && /^\d+$/.test(pageRaw) ? Number(pageRaw) : 1;

  return {
    flower: firstParam(raw.flower),
    color: firstParam(raw.color),
    style: firstParam(raw.style),
    category: firstParam(raw.category),
    occasion: firstParam(raw.occasion),
    recipient: firstParam(raw.recipient),
    minPrice: firstParam(raw.minPrice),
    maxPrice: firstParam(raw.maxPrice),
    band: firstParam(raw.band),
    sort,
    search: firstParam(raw.q) ?? firstParam(raw.search),
    page: pageNum > 0 ? pageNum : 1,
  };
}

export function catalogStateToListParams(state: CatalogSearchState): CatalogListParams {
  let minPriceMinor = majorBynToMinor(state.minPrice);
  let maxPriceMinor = majorBynToMinor(state.maxPrice);

  if (!minPriceMinor && !maxPriceMinor && state.band) {
    const band = PRICE_BANDS.find((b) => b.id === state.band);
    if (band) {
      minPriceMinor = band.minMinor;
      maxPriceMinor = band.maxMinor;
    }
  }

  return {
    page: state.page,
    pageSize: 24,
    search: state.search,
    categorySlug: state.category,
    occasionSlug: state.occasion,
    recipientSlug: state.recipient,
    styleSlug: state.style,
    colorSlug: state.color,
    flowerSlug: state.flower,
    minPriceMinor,
    maxPriceMinor,
    sort: state.sort,
  };
}

export function catalogHasActiveFilters(state: CatalogSearchState): boolean {
  return Boolean(
    state.flower ||
      state.color ||
      state.style ||
      state.category ||
      state.occasion ||
      state.recipient ||
      state.minPrice ||
      state.maxPrice ||
      state.band ||
      state.search,
  );
}

export function catalogStateToQuery(state: Partial<CatalogSearchState>): string {
  const params = new URLSearchParams();
  const entries: Array<[string, string | undefined]> = [
    ['flower', state.flower],
    ['color', state.color],
    ['style', state.style],
    ['category', state.category],
    ['occasion', state.occasion],
    ['recipient', state.recipient],
    ['minPrice', state.minPrice],
    ['maxPrice', state.maxPrice],
    ['band', state.band],
    ['sort', state.sort && state.sort !== 'featured' ? state.sort : undefined],
    ['q', state.search],
    ['page', state.page && state.page > 1 ? String(state.page) : undefined],
  ];
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: 'featured', label: 'По популярности' },
  { value: 'price_asc', label: 'Сначала дешевле' },
  { value: 'price_desc', label: 'Сначала дороже' },
  { value: 'newest', label: 'Новинки' },
];

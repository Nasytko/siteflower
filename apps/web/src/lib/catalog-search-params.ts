import { isProductSort, type ProductSort } from '@bouquet-one/contracts';
import { PRICE_BANDS } from '@/lib/media';
import type { CatalogListParams } from '@/lib/public-api';

export type CatalogSearchState = {
  flowers: string[];
  colors: string[];
  styles: string[];
  categories: string[];
  occasions: string[];
  recipients: string[];
  /** Customer-facing major BYN units as integer string, e.g. "150" */
  minPrice?: string;
  maxPrice?: string;
  band?: string;
  sort: ProductSort;
  search?: string;
  page: number;
};

const SLUG_LIST_MAX = 16;

/** Convert whole BYN major units to minor units as a decimal-free integer string. */
export function majorBynToMinor(major: string | undefined | null): string | undefined {
  if (!major) return undefined;
  const trimmed = major.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  return (BigInt(trimmed) * 100n).toString();
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
  return [...new Set(parts)].slice(0, SLUG_LIST_MAX);
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
  const sort: ProductSort = sortRaw && isProductSort(sortRaw) ? sortRaw : 'featured';
  const pageRaw = firstParam(raw.page);
  const pageNum = pageRaw && /^\d+$/.test(pageRaw) ? Number(pageRaw) : 1;

  return {
    flowers: parseSlugListParam(raw.flower),
    colors: parseSlugListParam(raw.color),
    styles: parseSlugListParam(raw.style),
    categories: parseSlugListParam(raw.category),
    occasions: parseSlugListParam(raw.occasion),
    recipients: parseSlugListParam(raw.recipient),
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
    categorySlug: joinSlugList(state.categories),
    occasionSlug: joinSlugList(state.occasions),
    recipientSlug: joinSlugList(state.recipients),
    styleSlug: joinSlugList(state.styles),
    colorSlug: joinSlugList(state.colors),
    flowerSlug: joinSlugList(state.flowers),
    minPriceMinor,
    maxPriceMinor,
    sort: state.sort,
  };
}

export function catalogHasActiveFilters(state: CatalogSearchState): boolean {
  return Boolean(
    state.flowers.length ||
      state.colors.length ||
      state.styles.length ||
      state.categories.length ||
      state.occasions.length ||
      state.recipients.length ||
      state.minPrice ||
      state.maxPrice ||
      state.band ||
      state.search,
  );
}

export function catalogActiveFilterCount(state: CatalogSearchState): number {
  let count =
    state.flowers.length +
    state.colors.length +
    state.styles.length +
    state.categories.length +
    state.occasions.length +
    state.recipients.length;
  if (state.band || state.minPrice || state.maxPrice) count += 1;
  if (state.search) count += 1;
  return count;
}

export function catalogStateToQuery(state: Partial<CatalogSearchState>): string {
  const params = new URLSearchParams();
  const listEntries: Array<[string, string[] | undefined]> = [
    ['flower', state.flowers],
    ['color', state.colors],
    ['style', state.styles],
    ['category', state.categories],
    ['occasion', state.occasions],
    ['recipient', state.recipients],
  ];
  for (const [key, value] of listEntries) {
    const joined = joinSlugList(value);
    if (joined) params.set(key, joined);
  }
  const entries: Array<[string, string | undefined]> = [
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

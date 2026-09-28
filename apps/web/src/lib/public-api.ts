import type {
  BestsellerGroupPublicDto,
  BouquetSizePublicDto,
  BudgetRangePublicDto,
  HomepageConfigDto,
  InstagramFeedPublicDto,
  PaginatedResponse,
  ProductListItemDto,
  ProductResolveDto,
  ProductSort,
  SitemapEntryDto,
  StorefrontSettingsPublicDto,
  TaxonomyPublicDto,
  TaxonomyRefDto,
} from '@bouquet-one/contracts';
import type { FulfillmentSettingsPublicDto } from '@bouquet-one/contracts';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PublicApiError';
  }
}

type FetchOptions = {
  searchParams?: Record<string, string | number | boolean | undefined | null>;
  /** Next.js fetch cache tags */
  tags?: string[];
  revalidate?: number | false;
  signal?: AbortSignal;
};

function buildUrl(path: string, searchParams?: FetchOptions['searchParams']): string {
  const url = new URL(`/api/v1${path}`, API_URL);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function publicFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = buildUrl(path, options.searchParams);
  const response = await fetch(url, {
    signal: options.signal,
    headers: { Accept: 'application/json' },
    next: {
      revalidate: options.revalidate === false ? undefined : (options.revalidate ?? 60),
      tags: options.tags,
    },
    ...(options.revalidate === false ? { cache: 'no-store' as const } : {}),
  });

  if (!response.ok) {
    throw new PublicApiError(`Public API ${path} failed`, response.status);
  }

  return (await response.json()) as T;
}

/**
 * Public catalog query — one vocabulary shared with the browser URL:
 * comma-joined ids/slugs, OR within a dimension, AND across dimensions.
 */
export type CatalogListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  /** BudgetRange ids */
  budget?: string;
  occasion?: string;
  recipient?: string;
  color?: string;
  flower?: string;
  /** BouquetSize slugs */
  size?: string;
  /** Only products with an effective promotion (powers /akcii). */
  promotion?: boolean;
  sort?: ProductSort;
};

export const EMPTY_PRODUCT_PAGE: PaginatedResponse<ProductListItemDto> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 0,
};

export function listProducts(params: CatalogListParams = {}) {
  const { promotion, budget, occasion, recipient, color, flower, size, ...rest } = params;
  return publicFetch<PaginatedResponse<ProductListItemDto>>('/catalog/products', {
    searchParams: {
      ...rest,
      // Browser URLs use short keys; API DTO expects long facet names.
      budgetRangeIds: budget,
      occasionSlugs: occasion,
      recipientSlugs: recipient,
      colorSlugs: color,
      flowerSlugs: flower,
      bouquetSizeSlugs: size,
      // API field is `promotionalOnly` (not `promotion`).
      promotionalOnly: promotion === true ? true : undefined,
    },
    tags: ['catalog', 'products'],
  });
}

/** Currently effective promotional products for homepage /akcii. */
export function listPromotionalProducts(limit = 8) {
  return publicFetch<ProductListItemDto[]>('/catalog/promotions', {
    searchParams: { limit },
    tags: ['catalog', 'products', 'promotions'],
  });
}

export function getProductBySlug(slug: string) {
  return publicFetch<ProductResolveDto>(`/catalog/products/${encodeURIComponent(slug)}`, {
    tags: ['catalog', `product:${slug}`],
  });
}

export function listRelatedProducts(slug: string, limit = 8) {
  return publicFetch<ProductListItemDto[]>(
    `/catalog/products/${encodeURIComponent(slug)}/related`,
    {
      searchParams: { limit },
      tags: ['catalog', `product:${slug}`],
    },
  );
}

export function listOccasions() {
  return publicFetch<TaxonomyRefDto[]>('/catalog/occasions', { tags: ['catalog', 'taxonomies'] });
}

export function listRecipients() {
  return publicFetch<TaxonomyRefDto[]>('/catalog/recipients', { tags: ['catalog', 'taxonomies'] });
}

export function listFlowers() {
  return publicFetch<TaxonomyRefDto[]>('/catalog/flowers', { tags: ['catalog', 'taxonomies'] });
}

export function listColors() {
  return publicFetch<TaxonomyRefDto[]>('/catalog/colors', { tags: ['catalog', 'taxonomies'] });
}

export function listProductLines() {
  return publicFetch<TaxonomyRefDto[]>('/catalog/product-lines', {
    tags: ['catalog', 'taxonomies'],
  });
}

export function listBouquetSizes() {
  return publicFetch<BouquetSizePublicDto[]>('/catalog/bouquet-sizes', {
    tags: ['catalog', 'taxonomies'],
  });
}

/** Admin-managed budget bands — never hardcode price brackets in the UI. */
export function listBudgetRanges() {
  return publicFetch<BudgetRangePublicDto[]>('/catalog/budget-ranges', {
    tags: ['catalog', 'budget-ranges'],
  });
}

/** Homepage bestsellers: Admin-curated groups, each already carrying its products. */
export function listBestsellerGroups() {
  return publicFetch<BestsellerGroupPublicDto[]>('/catalog/bestsellers', {
    tags: ['catalog', 'bestsellers'],
  });
}

/** Single bestseller / gifts shelf by slug (e.g. `podarki`). */
export function getBestsellerGroup(slug: string) {
  return publicFetch<BestsellerGroupPublicDto>(
    `/catalog/bestsellers/${encodeURIComponent(slug)}`,
    { tags: ['catalog', 'bestsellers', `bestseller:${slug}`] },
  );
}

/** Shared delivery/pickup rules from Admin fulfillment settings. */
export function getFulfillmentOptions() {
  return publicFetch<FulfillmentSettingsPublicDto>('/checkout/fulfillment-options', {
    tags: ['checkout', 'fulfillment'],
    revalidate: 60,
  });
}

export function getTaxonomy(kind: string, slug: string) {
  return publicFetch<TaxonomyPublicDto>(
    `/catalog/taxonomies/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`,
    { tags: ['catalog', 'taxonomies', `taxonomy:${kind}:${slug}`] },
  );
}

export function getSitemapEntries() {
  return publicFetch<SitemapEntryDto[]>('/catalog/sitemap', {
    tags: ['catalog', 'sitemap'],
    revalidate: 300,
  });
}

export function getStorefrontSettings() {
  return publicFetch<StorefrontSettingsPublicDto>('/storefront/settings', {
    tags: ['storefront', 'settings'],
  });
}

export function getHomepageConfig() {
  return publicFetch<HomepageConfigDto>('/storefront/homepage', {
    tags: ['storefront', 'homepage'],
  });
}

export function getInstagramFeed() {
  return publicFetch<InstagramFeedPublicDto>('/storefront/instagram', {
    tags: ['storefront', 'instagram'],
  });
}

/** Browser-side search with cancellation (relative rewrite). */
export async function searchProductsBrowser(
  query: string,
  signal?: AbortSignal,
): Promise<PaginatedResponse<ProductListItemDto>> {
  const params = new URLSearchParams({
    search: query,
    pageSize: '12',
    sort: 'recommended',
  });
  const response = await fetch(`/api/v1/catalog/products?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new PublicApiError('Search failed', response.status);
  }
  return (await response.json()) as PaginatedResponse<ProductListItemDto>;
}

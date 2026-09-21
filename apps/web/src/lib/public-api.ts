import type {
  CollectionPublicDto,
  HomepageConfigDto,
  PaginatedResponse,
  ProductListItemDto,
  ProductResolveDto,
  ProductSort,
  SitemapEntryDto,
  StorefrontSettingsPublicDto,
  TaxonomyPublicDto,
  TaxonomyRefDto,
} from '@bouquet-one/contracts';

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

export type CatalogListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  categorySlug?: string;
  occasionSlug?: string;
  recipientSlug?: string;
  styleSlug?: string;
  colorSlug?: string;
  flowerSlug?: string;
  minPriceMinor?: string;
  maxPriceMinor?: string;
  featured?: boolean;
  sort?: ProductSort;
};

export function listProducts(params: CatalogListParams = {}) {
  return publicFetch<PaginatedResponse<ProductListItemDto>>('/catalog/products', {
    searchParams: params,
    tags: ['catalog', 'products'],
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

export function listCategories() {
  return publicFetch<TaxonomyRefDto[]>('/catalog/categories', { tags: ['catalog', 'taxonomies'] });
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

export function listStyles() {
  return publicFetch<TaxonomyRefDto[]>('/catalog/styles', { tags: ['catalog', 'taxonomies'] });
}

export function listColors() {
  return publicFetch<TaxonomyRefDto[]>('/catalog/colors', { tags: ['catalog', 'taxonomies'] });
}

export function getTaxonomy(kind: string, slug: string) {
  return publicFetch<TaxonomyPublicDto>(
    `/catalog/taxonomies/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`,
    { tags: ['catalog', 'taxonomies', `taxonomy:${kind}:${slug}`] },
  );
}

export function getCollection(slug: string) {
  return publicFetch<CollectionPublicDto>(`/catalog/collections/${encodeURIComponent(slug)}`, {
    tags: ['catalog', `collection:${slug}`],
  });
}

export function listCollections() {
  return publicFetch<Array<{ slug: string; name: string; description: string | null }>>(
    '/catalog/collections',
    { tags: ['catalog', 'collections'] },
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

/** Browser-side search with cancellation (relative rewrite). */
export async function searchProductsBrowser(
  query: string,
  signal?: AbortSignal,
): Promise<PaginatedResponse<ProductListItemDto>> {
  const params = new URLSearchParams({
    search: query,
    pageSize: '12',
    sort: 'featured',
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

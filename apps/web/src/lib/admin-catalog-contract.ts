/**
 * Client-safe admin catalog contract helpers (no next/headers).
 * Wire shapes must match Nest admin DTOs under forbidNonWhitelisted.
 */

import { adminEndpoints, withQuery, type QueryValue } from './admin-endpoints';

/**
 * Canonical admin product list query — mirrors API `ProductListQueryDto` field names.
 * Do not send legacy aliases (`q`, `promotion`, singular `*Id`).
 */
export type ProductListQuery = {
  search?: string;
  lifecycle?: string;
  availability?: string;
  /** When true, only products with an effectively active promotion. */
  promotionalOnly?: boolean;
  bestsellerGroupIds?: string | readonly string[];
  occasionIds?: string | readonly string[];
  recipientIds?: string | readonly string[];
  colorIds?: string | readonly string[];
  bouquetSizeIds?: string | readonly string[];
  sort?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 25;

/** Build wire query params accepted by Nest ProductListQueryDto. */
export function buildProductListQueryParams(
  query: ProductListQuery = {},
): Record<string, QueryValue> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return {
    page,
    pageSize,
    search: query.search,
    lifecycle: query.lifecycle,
    availability: query.availability,
    promotionalOnly: query.promotionalOnly === true ? true : undefined,
    bestsellerGroupIds: query.bestsellerGroupIds,
    occasionIds: query.occasionIds,
    recipientIds: query.recipientIds,
    colorIds: query.colorIds,
    bouquetSizeIds: query.bouquetSizeIds,
    sort: query.sort,
  };
}

/** Canonical body for PUT /admin/catalog/bestsellers/:id/products */
export function buildBestsellerGroupProductsBody(
  expectedVersion: number,
  productIds: readonly string[],
): { expectedVersion: number; productIds: string[] } {
  return { expectedVersion, productIds: [...productIds] };
}

/** Canonical body for PUT /admin/catalog/products/:id/bestseller-groups */
export function buildProductBestsellerGroupsBody(
  expectedVersion: number,
  groupIds: readonly string[],
): { expectedVersion: number; groupIds: string[] } {
  return { expectedVersion, groupIds: [...groupIds] };
}

/** Canonical body for PATCH /admin/catalog/products/:id (quick availability). */
export function buildProductAvailabilityPatchBody(
  expectedVersion: number,
  availability: string,
): { expectedVersion: number; availability: string } {
  return { expectedVersion, availability };
}

export function productsListPath(query: ProductListQuery = {}): string {
  return withQuery(adminEndpoints.products, buildProductListQueryParams(query));
}

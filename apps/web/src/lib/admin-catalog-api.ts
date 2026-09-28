/**
 * Server-side reads for Admin catalog screens. Typed against @bouquet-one/contracts,
 * tolerant of endpoints that the API has not shipped yet (missing list -> empty list).
 */

import type {
  BestsellerGroupAdminDto,
  BouquetSizeAdminDto,
  BudgetRangeDto,
  ColorAdminDto,
  PaginatedResponse,
  ProductAdminDto,
  ProductListItemDto,
  ProductPromotionAdminDto,
  TaxonomyAdminDto,
} from '@bouquet-one/contracts';
import { AdminApiError, adminFetch } from './admin-api';
import { unwrapAdminList, unwrapAdminPage } from './admin-list';
import { adminEndpoints, withQuery, type QueryValue, type TaxonomyKind } from './admin-endpoints';

/** Product row on the Акции screen: public promo display + admin schedule when available. */
export type PromotionListItemDto = ProductListItemDto & {
  promotionAdmin?: ProductPromotionAdminDto | null;
};

export type ProductListQuery = {
  q?: string;
  lifecycle?: string;
  availability?: string;
  promotion?: string;
  bestsellerGroupId?: string;
  occasionId?: string;
  recipientId?: string;
  colorId?: string;
  bouquetSizeId?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 25;

/** Secondary data (pickers, badges): an endpoint the API has not added yet must not 500 the page. */
async function safeList<T>(path: string): Promise<T[]> {
  try {
    return unwrapAdminList(await adminFetch<PaginatedResponse<T> | T[]>(path));
  } catch (error) {
    if (error instanceof AdminApiError && (error.status === 404 || error.status === 501)) {
      return [];
    }
    throw error;
  }
}

export async function fetchProductsPage(
  query: ProductListQuery = {},
): Promise<PaginatedResponse<ProductListItemDto>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const params: Record<string, QueryValue> = { ...query, page, pageSize };
  const payload = await adminFetch<PaginatedResponse<ProductListItemDto>>(
    withQuery(adminEndpoints.products, params),
  );
  return unwrapAdminPage(payload, { page, pageSize });
}

export function fetchProduct(id: string): Promise<ProductAdminDto> {
  return adminFetch<ProductAdminDto>(adminEndpoints.product(id));
}

export function fetchTaxonomy(kind: 'colors'): Promise<ColorAdminDto[]>;
export function fetchTaxonomy(kind: 'bouquet-sizes'): Promise<BouquetSizeAdminDto[]>;
export function fetchTaxonomy(kind: 'product-lines'): Promise<BouquetSizeAdminDto[]>;
export function fetchTaxonomy(kind: TaxonomyKind): Promise<TaxonomyAdminDto[]>;
export function fetchTaxonomy(kind: TaxonomyKind): Promise<unknown[]> {
  return safeList(withQuery(adminEndpoints.taxonomy(kind), { page: 1, pageSize: 200 }));
}

export type ProductPickerTaxonomies = {
  occasions: TaxonomyAdminDto[];
  recipients: TaxonomyAdminDto[];
  colors: ColorAdminDto[];
  flowers: TaxonomyAdminDto[];
  bouquetSizes: BouquetSizeAdminDto[];
  productLines: BouquetSizeAdminDto[];
};

export async function fetchProductTaxonomies(): Promise<ProductPickerTaxonomies> {
  const [occasions, recipients, colors, flowers, bouquetSizes, productLines] = await Promise.all([
    fetchTaxonomy('occasions'),
    fetchTaxonomy('recipients'),
    fetchTaxonomy('colors'),
    fetchTaxonomy('flowers'),
    fetchTaxonomy('bouquet-sizes'),
    fetchTaxonomy('product-lines'),
  ]);
  return { occasions, recipients, colors, flowers, bouquetSizes, productLines };
}

export function fetchBudgetRanges(): Promise<BudgetRangeDto[]> {
  return safeList<BudgetRangeDto>(adminEndpoints.budgetRanges);
}

export function fetchBestsellerGroups(): Promise<BestsellerGroupAdminDto[]> {
  return safeList<BestsellerGroupAdminDto>(adminEndpoints.bestsellerGroups);
}

/**
 * Promotions screen. Prefers the dedicated endpoint; falls back to the product
 * list filtered by active promotion so the screen works during API rollout.
 */
export async function fetchPromotionRows(): Promise<PromotionListItemDto[]> {
  const direct = await safeList<PromotionListItemDto>(
    withQuery(adminEndpoints.promotions, { page: 1, pageSize: 100 }),
  );
  if (direct.length > 0) return direct;

  const fallback = await fetchProductsPage({ promotion: 'any', pageSize: 100 });
  return fallback.items.filter((item) => item.promotion !== null);
}

/** Dashboard counters: `total` from a pageSize=1 list; null when unavailable. */
export async function fetchTotal(
  path: string,
  params: Record<string, QueryValue> = {},
): Promise<number | null> {
  try {
    const payload = await adminFetch<PaginatedResponse<unknown>>(
      withQuery(path, { ...params, page: 1, pageSize: 1 }),
    );
    return typeof payload?.total === 'number' ? payload.total : null;
  } catch {
    return null;
  }
}

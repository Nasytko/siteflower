import type { PaginatedResponse } from '@bouquet-one/contracts';

/** Admin list endpoints return `{ items, total, page, pageSize }`. */
export function unwrapAdminList<T>(payload: PaginatedResponse<T> | T[] | null | undefined): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

/** Same unwrap, but keeps pagination metadata for list screens. */
export function unwrapAdminPage<T>(
  payload: PaginatedResponse<T> | T[] | null | undefined,
  fallback: { page: number; pageSize: number },
): PaginatedResponse<T> {
  const items = unwrapAdminList(payload);
  if (Array.isArray(payload) || !payload) {
    return { items, total: items.length, page: fallback.page, pageSize: fallback.pageSize };
  }
  return {
    items,
    total: typeof payload.total === 'number' ? payload.total : items.length,
    page: typeof payload.page === 'number' ? payload.page : fallback.page,
    pageSize: typeof payload.pageSize === 'number' ? payload.pageSize : fallback.pageSize,
  };
}

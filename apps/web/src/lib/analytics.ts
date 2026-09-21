/**
 * Typed analytics abstraction — no-op until a provider is selected.
 * Never send PII or fingerprints.
 */

export type AnalyticsEventMap = {
  view_home: Record<string, never>;
  view_catalog: { filters?: string };
  view_product: { slug: string };
  search: { query: string; resultCount?: number };
  select_filter: { key: string; value: string };
  add_to_favorites: { productId: string; slug: string };
  remove_from_favorites: { productId: string; slug: string };
  add_to_cart: { productId: string; variantId: string; quantity: number };
  remove_from_cart: { variantId: string };
  view_cart: { itemCount: number };
  begin_checkout: { itemCount: number };
  select_fulfillment: { type: string };
  order_created: { orderNumber: string; fulfillmentType: string };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

export function trackEvent<E extends AnalyticsEventName>(
  event: E,
  payload: AnalyticsEventMap[E],
): void {
  if (process.env.NODE_ENV === 'development') {
    console.debug('[analytics]', event, payload);
  }
}

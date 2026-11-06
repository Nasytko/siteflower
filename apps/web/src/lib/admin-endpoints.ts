/**
 * Single source of truth for Admin API paths (same-origin `/api/v1` rewrite).
 * Safe to import from both server and client components.
 */

const ADMIN = '/api/v1/admin';

export const TAXONOMY_KINDS = ['colors', 'occasions', 'holidays', 'recipients'] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export type TaxonomyKindMeta = {
  kind: TaxonomyKind;
  title: string;
  lead: string;
  /** Singular for the "add" form. */
  itemLabel: string;
  hasSwatch: boolean;
  hasDescription: boolean;
  /** Colors/occasions/holidays/recipients expose SEO overrides. */
  hasSeo: boolean;
};

export const TAXONOMY_KIND_META: Record<TaxonomyKind, TaxonomyKindMeta> = {
  colors: {
    kind: 'colors',
    title: 'Цвета',
    lead: 'Палитра для позиций в справочнике цветов и фильтров на витрине. Не путать со страницами каталога.',
    itemLabel: 'цвет',
    hasSwatch: true,
    hasDescription: true,
    hasSeo: true,
  },
  occasions: {
    kind: 'occasions',
    title: 'Поводы',
    lead: 'Личные поводы в карточке товара (день рождения, свадьба). Помогают клиенту найти букет на витрине.',
    itemLabel: 'повод',
    hasSwatch: false,
    hasDescription: true,
    hasSeo: true,
  },
  holidays: {
    kind: 'holidays',
    title: 'К празднику',
    lead: 'Календарные праздники (8 марта, Новый год, 14 февраля). Ставятся в карточке товара и открывают страницы /k-prazdniku/…',
    itemLabel: 'праздник',
    hasSwatch: false,
    hasDescription: true,
    hasSeo: true,
  },
  recipients: {
    kind: 'recipients',
    title: 'Кому',
    lead: 'Для кого букет (маме, девушке, коллеге). Ставятся в карточке товара и в фильтрах.',
    itemLabel: 'получателя',
    hasSwatch: false,
    hasDescription: true,
    hasSeo: true,
  },
};

export function isTaxonomyKind(value: string): value is TaxonomyKind {
  return (TAXONOMY_KINDS as readonly string[]).includes(value);
}

export const adminEndpoints = {
  products: `${ADMIN}/catalog/products`,
  productsBulk: `${ADMIN}/catalog/products/bulk`,
  product: (id: string) => `${ADMIN}/catalog/products/${id}`,
  productDuplicate: (id: string) => `${ADMIN}/catalog/products/${id}/duplicate`,
  productEditor: (id: string) => `${ADMIN}/catalog/products/${id}/editor`,
  productPreview: (id: string) => `${ADMIN}/catalog/products/${id}/preview`,
  productPlacement: (id: string) => `${ADMIN}/catalog/products/${id}/placement`,
  productVariants: (id: string) => `${ADMIN}/catalog/products/${id}/variants`,
  productTaxonomies: (id: string) => `${ADMIN}/catalog/products/${id}/taxonomies`,
  productPromotion: (id: string) => `${ADMIN}/catalog/products/${id}/promotion`,
  productBestsellerGroups: (id: string) => `${ADMIN}/catalog/products/${id}/bestseller-groups`,
  productLifecycle: (id: string, action: 'publish' | 'unpublish' | 'archive' | 'restore') =>
    `${ADMIN}/catalog/products/${id}/${action}`,
  productDeleteImpact: (id: string) => `${ADMIN}/catalog/products/${id}/delete-impact`,
  productRelatedSuggestions: (id: string) =>
    `${ADMIN}/catalog/products/${id}/related-suggestions`,
  productRelated: (id: string) => `${ADMIN}/catalog/products/${id}/related`,
  productRelatedItem: (id: string, relatedId: string) =>
    `${ADMIN}/catalog/products/${id}/related/${relatedId}`,
  productMedia: (id: string) => `${ADMIN}/catalog/products/${id}/media`,
  productMediaItem: (id: string, mediaId: string) =>
    `${ADMIN}/catalog/products/${id}/media/${mediaId}`,
  productMediaOrder: (id: string) => `${ADMIN}/catalog/products/${id}/media/order`,

  taxonomy: (kind: TaxonomyKind) => `${ADMIN}/catalog/${kind}`,
  taxonomyItem: (kind: TaxonomyKind, id: string) => `${ADMIN}/catalog/${kind}/${id}`,
  taxonomyDeleteImpact: (kind: TaxonomyKind, id: string) =>
    `${ADMIN}/catalog/${kind}/${id}/delete-impact`,

  budgetRanges: `${ADMIN}/catalog/budget-ranges`,
  budgetRange: (id: string) => `${ADMIN}/catalog/budget-ranges/${id}`,
  budgetRangesOrder: `${ADMIN}/catalog/budget-ranges/order`,

  packagingAddons: `${ADMIN}/catalog/packaging-addons`,
  packagingAddon: (id: string) => `${ADMIN}/catalog/packaging-addons/${id}`,

  bestsellerGroups: `${ADMIN}/catalog/bestsellers`,
  bestsellerGroup: (id: string) => `${ADMIN}/catalog/bestsellers/${id}`,
  bestsellerGroupProducts: (id: string) => `${ADMIN}/catalog/bestsellers/${id}/products`,
  bestsellerGroupProductsOrder: (id: string) =>
    `${ADMIN}/catalog/bestsellers/${id}/products/order`,

  promotions: `${ADMIN}/catalog/promotions`,

  catalogCategories: `${ADMIN}/catalog/categories`,
  catalogCategoriesTree: `${ADMIN}/catalog/categories/tree`,
  catalogCategory: (id: string) => `${ADMIN}/catalog/categories/${id}`,
  catalogCategoryReorder: (id: string) => `${ADMIN}/catalog/categories/${id}/reorder`,
  catalogCategoryReassignDelete: (id: string) =>
    `${ADMIN}/catalog/categories/${id}/reassign-and-delete`,
  catalogFilterDefinitions: `${ADMIN}/catalog/categories/filter-definitions`,
  catalogCategoryFilters: (id: string) => `${ADMIN}/catalog/categories/${id}/filters`,
  catalogCategoryFiltersPreset: (id: string) =>
    `${ADMIN}/catalog/categories/${id}/filters/apply-preset`,
  /** Unified «Страницы каталога». */
  catalogPages: `${ADMIN}/catalog/pages`,
  catalogPage: (id: string) => `${ADMIN}/catalog/pages/${id}`,
  catalogPagePublish: (id: string) => `${ADMIN}/catalog/pages/${id}/publish`,
  catalogPageUnpublish: (id: string) => `${ADMIN}/catalog/pages/${id}/unpublish`,
  catalogPageDeleteImpact: (id: string) => `${ADMIN}/catalog/pages/${id}/delete-impact`,
  catalogPageTraits: `${ADMIN}/catalog/pages/traits`,
  catalogPagePreviewRules: `${ADMIN}/catalog/pages/preview-rules`,
  catalogPageProductMatch: (pageId: string, productId: string) =>
    `${ADMIN}/catalog/pages/${pageId}/products/${productId}/match`,

  flowerTypes: `${ADMIN}/catalog/flower-refs/types`,
  flowerType: (id: string) => `${ADMIN}/catalog/flower-refs/types/${id}`,
  flowerTypeReassignDelete: (id: string) =>
    `${ADMIN}/catalog/flower-refs/types/${id}/reassign-and-delete`,
  flowerVarieties: `${ADMIN}/catalog/flower-refs/varieties`,
  flowerVariety: (id: string) => `${ADMIN}/catalog/flower-refs/varieties/${id}`,
  flowerVarietyReassignDelete: (id: string) =>
    `${ADMIN}/catalog/flower-refs/varieties/${id}/reassign-and-delete`,
  flowerOrigins: `${ADMIN}/catalog/flower-refs/origins`,
  flowerOrigin: (id: string) => `${ADMIN}/catalog/flower-refs/origins/${id}`,
  flowerOriginReassignDelete: (id: string) =>
    `${ADMIN}/catalog/flower-refs/origins/${id}/reassign-and-delete`,
  flowerForms: `${ADMIN}/catalog/flower-refs/forms`,
  flowerForm: (id: string) => `${ADMIN}/catalog/flower-refs/forms/${id}`,
  flowerItems: `${ADMIN}/catalog/flower-refs/items`,
  flowerItem: (id: string) => `${ADMIN}/catalog/flower-refs/items/${id}`,

  productFamilies: `${ADMIN}/catalog/product-families`,
  productFamily: (id: string) => `${ADMIN}/catalog/product-families/${id}`,
  productFamilyMembersOrder: (id: string) =>
    `${ADMIN}/catalog/product-families/${id}/members/order`,

  orders: `${ADMIN}/orders`,
  ordersSummary: `${ADMIN}/orders/summary`,
  order: (id: string) => `${ADMIN}/orders/${id}`,
  orderRetryErp: (id: string) => `${ADMIN}/orders/${id}/retry-erp`,
  orderRetryTelegram: (id: string) => `${ADMIN}/orders/${id}/retry-telegram`,
  instagramPosts: `${ADMIN}/storefront/instagram/posts`,
  instagramPost: (id: string) => `${ADMIN}/storefront/instagram/posts/${id}`,
  instagramPostsOrder: `${ADMIN}/storefront/instagram/posts/order`,

  integrationErpStatus: `${ADMIN}/integrations/erp/status`,
  integrationErpEvents: `${ADMIN}/integrations/erp/events`,
  integrationErpEvent: (id: string) => `${ADMIN}/integrations/erp/events/${id}`,
  integrationErpEventRetry: (id: string) => `${ADMIN}/integrations/erp/events/${id}/retry`,
  integrationErpTestConnection: `${ADMIN}/integrations/erp/test-connection`,
  integrationErpTestEvent: `${ADMIN}/integrations/erp/test-event`,
  integrationErpEnabled: `${ADMIN}/integrations/erp/enabled`,
  mediaHealth: `${ADMIN}/media/health`,
  mediaHealthProbe: `${ADMIN}/media/health/probe`,
  mediaAssets: `${ADMIN}/media/assets`,
  mediaAssetPurge: (id: string) => `${ADMIN}/media/assets/${id}/purge`,
  mediaUpload: `${ADMIN}/media/upload`,
  mediaLibrary: `${ADMIN}/media/library`,
  seoSummary: `${ADMIN}/seo/summary`,
  seoHealth: `${ADMIN}/seo/health`,
  homepage: `${ADMIN}/storefront/homepage`,
  homepageSeo: `${ADMIN}/storefront/homepage/seo`,
  homepageDiscoveryTiles: `${ADMIN}/storefront/homepage/discovery-tiles`,
} as const;

export type QueryValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>;

/** Append a query string, skipping empty values. Arrays become comma-separated (Nest toStringList). */
export function withQuery(path: string, params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const joined = value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0)
        .join(',');
      if (joined.length === 0) continue;
      search.set(key, joined);
      continue;
    }
    const text = String(value);
    if (text.length === 0) continue;
    search.set(key, text);
  }
  const query = search.toString();
  return query.length > 0 ? `${path}?${query}` : path;
}

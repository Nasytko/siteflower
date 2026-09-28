/**
 * Single source of truth for Admin API paths (same-origin `/api/v1` rewrite).
 * Safe to import from both server and client components.
 */

const ADMIN = '/api/v1/admin';

export const TAXONOMY_KINDS = [
  'flowers',
  'colors',
  'bouquet-sizes',
  'product-lines',
  'occasions',
  'recipients',
] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export type TaxonomyKindMeta = {
  kind: TaxonomyKind;
  title: string;
  lead: string;
  /** Singular for the "add" form. */
  itemLabel: string;
  hasSwatch: boolean;
  hasDescription: boolean;
};

export const TAXONOMY_KIND_META: Record<TaxonomyKind, TaxonomyKindMeta> = {
  flowers: {
    kind: 'flowers',
    title: 'Цветы',
    lead: 'Справочник цветов. Фильтр «Цветок» на витрине собирается из состава букетов.',
    itemLabel: 'цветок',
    hasSwatch: false,
    hasDescription: true,
  },
  colors: {
    kind: 'colors',
    title: 'Цвета',
    lead: 'Палитра для подбора букета. Оттенок можно задать для наглядности в админке.',
    itemLabel: 'цвет',
    hasSwatch: true,
    hasDescription: true,
  },
  'bouquet-sizes': {
    kind: 'bouquet-sizes',
    title: 'Размеры',
    lead: 'Размеры букета. У товара — один размер.',
    itemLabel: 'размер',
    hasSwatch: false,
    hasDescription: true,
  },
  'product-lines': {
    kind: 'product-lines',
    title: 'Линейки',
    lead: 'Форматы и линейки: моно букеты, композиции в шляпной коробке и другие.',
    itemLabel: 'линейку',
    hasSwatch: false,
    hasDescription: true,
  },
  occasions: {
    kind: 'occasions',
    title: 'Поводы',
    lead: 'Поводы для подбора букета: день рождения, свадьба, извинение.',
    itemLabel: 'повод',
    hasSwatch: false,
    hasDescription: true,
  },
  recipients: {
    kind: 'recipients',
    title: 'Кому',
    lead: 'Получатели: маме, девушке, коллеге.',
    itemLabel: 'получателя',
    hasSwatch: false,
    hasDescription: true,
  },
};

export function isTaxonomyKind(value: string): value is TaxonomyKind {
  return (TAXONOMY_KINDS as readonly string[]).includes(value);
}

export const adminEndpoints = {
  products: `${ADMIN}/catalog/products`,
  product: (id: string) => `${ADMIN}/catalog/products/${id}`,
  productPreview: (id: string) => `${ADMIN}/catalog/products/${id}/preview`,
  productVariants: (id: string) => `${ADMIN}/catalog/products/${id}/variants`,
  productComponents: (id: string) => `${ADMIN}/catalog/products/${id}/components`,
  productTaxonomies: (id: string) => `${ADMIN}/catalog/products/${id}/taxonomies`,
  productPromotion: (id: string) => `${ADMIN}/catalog/products/${id}/promotion`,
  productBestsellers: (id: string) => `${ADMIN}/catalog/products/${id}/bestsellers`,
  productLifecycle: (id: string, action: 'publish' | 'unpublish' | 'archive') =>
    `${ADMIN}/catalog/products/${id}/${action}`,
  productMedia: (id: string) => `${ADMIN}/catalog/products/${id}/media`,
  productMediaItem: (id: string, mediaId: string) =>
    `${ADMIN}/catalog/products/${id}/media/${mediaId}`,
  productMediaOrder: (id: string) => `${ADMIN}/catalog/products/${id}/media/order`,

  taxonomy: (kind: TaxonomyKind) => `${ADMIN}/catalog/${kind}`,
  taxonomyItem: (kind: TaxonomyKind, id: string) => `${ADMIN}/catalog/${kind}/${id}`,

  budgetRanges: `${ADMIN}/catalog/budget-ranges`,
  budgetRange: (id: string) => `${ADMIN}/catalog/budget-ranges/${id}`,

  bestsellerGroups: `${ADMIN}/catalog/bestsellers`,
  bestsellerGroup: (id: string) => `${ADMIN}/catalog/bestsellers/${id}`,
  bestsellerGroupProducts: (id: string) => `${ADMIN}/catalog/bestsellers/${id}/products`,

  promotions: `${ADMIN}/catalog/promotions`,

  orders: `${ADMIN}/orders`,
  storefrontSettings: `${ADMIN}/storefront/settings`,
  homepage: `${ADMIN}/storefront/homepage`,
  instagramPosts: `${ADMIN}/storefront/instagram/posts`,
  instagramPost: (id: string) => `${ADMIN}/storefront/instagram/posts/${id}`,
  instagramPostsOrder: `${ADMIN}/storefront/instagram/posts/order`,
} as const;

export type QueryValue = string | number | boolean | null | undefined;

/** Append a query string, skipping empty values. */
export function withQuery(path: string, params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    const text = String(value);
    if (text.length === 0) continue;
    search.set(key, text);
  }
  const query = search.toString();
  return query.length > 0 ? `${path}?${query}` : path;
}

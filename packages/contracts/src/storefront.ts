/**
 * Storefront configuration contracts — constrained CMS, not a page builder.
 */

export const PRODUCT_SORTS = ['featured', 'price_asc', 'price_desc', 'newest'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const TAXONOMY_LANDING_KINDS = ['flower', 'occasion', 'recipient'] as const;
export type TaxonomyLandingKind = (typeof TAXONOMY_LANDING_KINDS)[number];

export const HOMEPAGE_SECTION_KINDS = [
  'featured',
  'collection',
  'occasions',
  'recipients',
  'discovery',
  'help',
  'delivery',
] as const;
export type HomepageSectionKind = (typeof HOMEPAGE_SECTION_KINDS)[number];

export type HomepageHeroDto = {
  title: string;
  subtitle: string;
  /** Public media URL or absolute path under /media or site origin */
  imageUrl: string | null;
  ctaLabel: string;
  ctaHref: string;
};

export type HomepageSectionDto = {
  id: string;
  kind: HomepageSectionKind;
  enabled: boolean;
  heading: string;
  /** Collection slug when kind === 'collection' */
  collectionSlug?: string | null;
  sortOrder: number;
};

export type HomepageConfigDto = {
  hero: HomepageHeroDto;
  sections: HomepageSectionDto[];
};

export type HomepageConfigAdminDto = HomepageConfigDto & {
  version: number;
  updatedAt: string;
};

export type StorefrontSettingsPublicDto = {
  brandName: string;
  city: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  workingHours: string | null;
  deliverySummary: string | null;
  aboutSummary: string | null;
  instagramUrl: string | null;
  telegramUrl: string | null;
  substitutionNote: string | null;
};

export type StorefrontSettingsAdminDto = StorefrontSettingsPublicDto & {
  version: number;
  updatedAt: string;
};

export type UpdateStorefrontSettingsDto = Partial<StorefrontSettingsPublicDto> & {
  expectedVersion: number;
};

export type UpdateHomepageConfigDto = {
  expectedVersion: number;
  hero: HomepageHeroDto;
  sections: HomepageSectionDto[];
};

export type TaxonomyPublicDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: TaxonomyLandingKind | 'category' | 'style' | 'color';
  seo: {
    seoTitle: string | null;
    seoDescription: string | null;
    noIndex: boolean;
    resolvedTitle: string;
    resolvedDescription: string;
  };
};

export type SitemapEntryDto = {
  path: string;
  updatedAt: string | null;
  /** When true, page should be noindexed (still listed only if useful for discovery — prefer omit) */
  noIndex?: boolean;
};

export type ProductResolveDto = {
  product: import('./catalog').ProductPublicDto;
  /** True when request slug was an old alias resolved via SlugRedirect */
  redirectedFrom: string | null;
  canonicalSlug: string;
};

export function isProductSort(value: string): value is ProductSort {
  return (PRODUCT_SORTS as readonly string[]).includes(value);
}

export function defaultHomepageConfig(): HomepageConfigDto {
  return {
    hero: {
      title: 'Цветы, которые хочется дарить',
      subtitle: 'Свежие букеты с доставкой по Гродно — спокойно, аккуратно, без лишнего.',
      imageUrl: null,
      ctaLabel: 'Выбрать букет',
      ctaHref: '/bukety',
    },
    sections: [
      {
        id: 'featured',
        kind: 'featured',
        enabled: true,
        heading: 'Популярное',
        sortOrder: 10,
      },
      {
        id: 'discovery',
        kind: 'discovery',
        enabled: true,
        heading: 'Быстрый выбор',
        sortOrder: 20,
      },
      {
        id: 'occasions',
        kind: 'occasions',
        enabled: true,
        heading: 'Поводы',
        sortOrder: 30,
      },
      {
        id: 'help',
        kind: 'help',
        enabled: true,
        heading: 'Не знаете, что выбрать?',
        sortOrder: 40,
      },
      {
        id: 'delivery',
        kind: 'delivery',
        enabled: true,
        heading: 'Доставка по Гродно',
        sortOrder: 50,
      },
    ],
  };
}

export function defaultStorefrontSettings(): StorefrontSettingsPublicDto {
  return {
    brandName: 'БУКЕТ №1',
    city: 'Гродно',
    phone: null,
    email: null,
    address: null,
    workingHours: null,
    deliverySummary:
      'Доставляем букеты по Гродно. После оформления заказа менеджер свяжется для подтверждения деталей.',
    aboutSummary:
      'БУКЕТ №1 — цветочный магазин в Гродно. Собираем букеты, которые хочется дарить: свежие цветы, аккуратная сборка, понятная доставка.',
    instagramUrl: null,
    telegramUrl: null,
    substitutionNote:
      'Цветы — сезонный продукт. Отдельные позиции могут быть заменены на равноценные с сохранением стиля, палитры и стоимости букета.',
  };
}

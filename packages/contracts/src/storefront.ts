/**
 * Storefront configuration contracts — constrained CMS, not a page builder.
 */

import type { ProductSort } from './catalog';

export type { ProductSort };
/** `PRODUCT_SORTS` / `isProductSort` live in ./catalog and are re-exported by the package index. */

export const TAXONOMY_LANDING_KINDS = ['flower', 'occasion', 'recipient', 'color'] as const;
export type TaxonomyLandingKind = (typeof TAXONOMY_LANDING_KINDS)[number];

export const HOMEPAGE_SECTION_KINDS = [
  'promotions',
  'bestsellers',
  'gifts',
  'instagram',
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

/** Curated Instagram post (admin + public share the same shape). */
export type InstagramPostDto = {
  id: string;
  imageUrl: string;
  postUrl: string | null;
  caption: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type InstagramFeedPublicDto = {
  brandName: string;
  /** Absolute profile URL when configured. */
  profileUrl: string | null;
  /** Display handle including @, or null when Instagram is not configured. */
  handle: string | null;
  posts: InstagramPostDto[];
};

export type CreateInstagramPostDto = {
  imageUrl: string;
  postUrl?: string | null;
  caption?: string | null;
  enabled?: boolean;
  sortOrder?: number;
};

export type UpdateInstagramPostDto = {
  imageUrl?: string;
  postUrl?: string | null;
  caption?: string | null;
  enabled?: boolean;
  sortOrder?: number;
};

export type ReorderInstagramPostsDto = {
  orderedIds: string[];
};

/**
 * Extract `@handle` from a profile URL or raw handle string.
 * Returns null when nothing usable is found.
 */
export function parseInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const atMatch = trimmed.match(/^@([A-Za-z0-9._]{1,30})$/);
  if (atMatch) return `@${atMatch[1]}`;
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (!/instagram\.com$/i.test(url.hostname.replace(/^www\./, ''))) {
      // Still allow bare host forms
      if (!url.hostname.toLowerCase().includes('instagram.com')) return null;
    }
    const part = url.pathname.split('/').filter(Boolean)[0];
    if (!part || part.length > 30) return null;
    if (!/^[A-Za-z0-9._]+$/.test(part)) return null;
    return `@${part}`;
  } catch {
    return null;
  }
}

export type TaxonomyPublicDto = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: TaxonomyLandingKind | 'bouquet_size';
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
        id: 'promotions',
        kind: 'promotions',
        enabled: true,
        heading: 'Акционные предложения',
        sortOrder: 10,
      },
      {
        id: 'bestsellers',
        kind: 'bestsellers',
        enabled: true,
        heading: 'Наши бестселлеры',
        sortOrder: 20,
      },
      {
        id: 'gifts',
        kind: 'gifts',
        enabled: true,
        heading: 'Подарки',
        sortOrder: 30,
      },
      {
        id: 'instagram',
        kind: 'instagram',
        enabled: true,
        heading: 'В Instagram',
        sortOrder: 35,
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
    brandName: 'BUKET №1',
    city: 'Гродно',
    phone: '+375 (29) 798-22-22',
    email: null,
    address: 'пр-т Янки Купалы, 67А, г. Гродно, 230000',
    workingHours: '9:00–21:00',
    deliverySummary:
      'Доставляем букеты по Гродно. После оформления заказа менеджер свяжется для подтверждения деталей.',
    aboutSummary:
      'BUKET №1 — цветочный магазин в Гродно. Собираем букеты, которые хочется дарить: свежие цветы, аккуратная сборка, понятная доставка.',
    instagramUrl: null,
    telegramUrl: null,
    substitutionNote:
      'Цветы — сезонный продукт. Отдельные позиции могут быть заменены на равноценные с сохранением стиля, палитры и стоимости букета.',
  };
}

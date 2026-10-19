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
  'autumn',
  'popular',
  'bestsellers',
  'roses',
  'gifts',
  'instagram',
  'occasions',
  'recipients',
  'discovery',
  'help',
  'delivery',
  'perks',
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

/** Multi-slide hero banner (admin-managed). */
export type HomepageHeroSlideDto = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  /** Optional tighter crop for small screens. */
  mobileImageUrl?: string | null;
  ctaLabel: string;
  ctaHref: string;
  enabled: boolean;
  sortOrder: number;
  /** ISO date — optional schedule window. */
  startsAt?: string | null;
  endsAt?: string | null;
};

export type HomepageSectionTheme = 'default' | 'autumn';

export type HomepageSectionDto = {
  id: string;
  kind: HomepageSectionKind;
  enabled: boolean;
  heading: string;
  sortOrder: number;
  /** Short supporting line under the heading. */
  body?: string | null;
  /** «Смотреть все» destination. */
  viewAllHref?: string | null;
  /** Max products to show (shelf sections). */
  limit?: number | null;
  /**
   * Product source: CatalogCategory / CatalogPage slug, or BestsellerGroup slug
   * (popular/autumn). Empty = built-in default for the kind.
   */
  sourceSlug?: string | null;
  theme?: HomepageSectionTheme | null;
  /** Optional media for help / decorative blocks. */
  imageUrl?: string | null;
};

/** Illustrated category tiles on the homepage (no section title on the storefront). */
export type HomepageDiscoveryTileDto = {
  id: string;
  label: string;
  href: string;
  /** Public media URL or site-relative path (e.g. /categories/…). */
  imageUrl: string;
  imageAlt: string;
  enabled: boolean;
  sortOrder: number;
};

export type HomepagePerkDto = {
  id: string;
  title: string;
  enabled: boolean;
  sortOrder: number;
};

export type HomepageConfigDto = {
  /** @deprecated Prefer heroSlides[0]; kept for migration / single-slide fallback. */
  hero: HomepageHeroDto;
  heroSlides: HomepageHeroSlideDto[];
  sections: HomepageSectionDto[];
  discoveryTiles: HomepageDiscoveryTileDto[];
  perks: HomepagePerkDto[];
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
  heroSlides: HomepageHeroSlideDto[];
  sections: HomepageSectionDto[];
  discoveryTiles: HomepageDiscoveryTileDto[];
  perks: HomepagePerkDto[];
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
  kind: TaxonomyLandingKind;
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

/** Default illustrated tiles for the homepage category row (7 tiles). */
export function defaultHomepageDiscoveryTiles(): HomepageDiscoveryTileDto[] {
  return [
    {
      id: 'cvety-pcs',
      label: 'Цветы поштучно',
      href: '/cvety',
      imageUrl: '/categories/discovery-roza.png',
      imageAlt: 'Цветы поштучно',
      enabled: true,
      sortOrder: 10,
    },
    {
      id: 'bukety-iz-roz',
      label: 'Букеты из роз',
      href: '/katalog/bukety-iz-roz',
      imageUrl: '/categories/discovery-buket-roz.png',
      imageAlt: 'Букеты из роз',
      enabled: true,
      sortOrder: 20,
    },
    {
      id: 'bukety',
      label: 'Букеты цветов',
      href: '/bukety',
      imageUrl: '/categories/discovery-sbornye.png',
      imageAlt: 'Букеты цветов',
      enabled: true,
      sortOrder: 30,
    },
    {
      id: 'kompozicii',
      label: 'Композиции из цветов',
      href: '/katalog/kompozicii',
      imageUrl: '/categories/discovery-kompozicii.png',
      imageAlt: 'Цветочные композиции',
      enabled: true,
      sortOrder: 40,
    },
    {
      id: 'neveste',
      label: 'Букет невесты',
      href: '/komu/neveste',
      imageUrl: '/categories/discovery-nevesta.png',
      imageAlt: 'Букет невесты',
      enabled: true,
      sortOrder: 50,
    },
    {
      id: 'shary',
      label: 'Воздушные шары',
      href: '/katalog/podarki',
      imageUrl: '/categories/discovery-podarki.png',
      imageAlt: 'Воздушные шары',
      enabled: true,
      sortOrder: 60,
    },
    {
      id: 'otkrytki',
      label: 'Открытки',
      href: '/katalog/otkrytki',
      imageUrl: '/categories/discovery-den-rozhdeniya.png',
      imageAlt: 'Открытки',
      enabled: true,
      sortOrder: 70,
    },
  ];
}

export function defaultHomepagePerks(): HomepagePerkDto[] {
  return [
    {
      id: 'fresh',
      title: 'Свежие цветы каждый день',
      enabled: true,
      sortOrder: 10,
    },
    {
      id: 'delivery',
      title: 'Доставка по Гродно и области',
      enabled: true,
      sortOrder: 20,
    },
    {
      id: 'authorial',
      title: 'Авторские букеты с заботой',
      enabled: true,
      sortOrder: 30,
    },
    {
      id: 'payment',
      title: 'Удобная оплата при получении',
      enabled: true,
      sortOrder: 40,
    },
  ];
}

export function defaultHomepageHeroSlides(): HomepageHeroSlideDto[] {
  return [
    {
      id: 'main',
      title: 'Осенние букеты',
      subtitle: 'Сезонная коллекция — тёплые оттенки и свежая сборка с доставкой по Гродно.',
      imageUrl: '/categories/autumn-bouquet-warm.jpg',
      mobileImageUrl: null,
      ctaLabel: 'Смотреть коллекцию',
      ctaHref: '/bukety',
      enabled: true,
      sortOrder: 10,
      startsAt: null,
      endsAt: null,
    },
  ];
}

export function defaultHomepageConfig(): HomepageConfigDto {
  const heroSlides = defaultHomepageHeroSlides();
  const primary = heroSlides[0]!;
  return {
    hero: {
      title: primary.title,
      subtitle: primary.subtitle,
      imageUrl: primary.imageUrl,
      ctaLabel: primary.ctaLabel,
      ctaHref: primary.ctaHref,
    },
    heroSlides,
    sections: [
      {
        id: 'promotions',
        kind: 'promotions',
        enabled: true,
        heading: 'Акционные товары',
        sortOrder: 10,
        viewAllHref: '/akcii',
        limit: 5,
      },
      {
        id: 'autumn',
        kind: 'autumn',
        enabled: true,
        heading: 'Вдохновение осени',
        body: 'Тёплые букеты сезона — янтарь, бордо и сухая зелень.',
        sortOrder: 20,
        viewAllHref: '/katalog/bukety-s-rozami',
        sourceSlug: 'bukety-s-rozami',
        limit: 5,
        theme: 'autumn',
      },
      {
        id: 'popular',
        kind: 'popular',
        enabled: true,
        heading: 'Популярные букеты',
        sortOrder: 30,
        viewAllHref: '/bukety',
        limit: 10,
      },
      {
        id: 'roses',
        kind: 'roses',
        enabled: true,
        heading: 'Розы',
        sortOrder: 40,
        viewAllHref: '/katalog/rozy',
        sourceSlug: 'rozy',
        limit: 5,
      },
      {
        id: 'help',
        kind: 'help',
        enabled: true,
        heading: 'Поможем выбрать идеальный букет',
        body: 'Напишите или позвоните — подскажем по поводу, бюджету и сроку доставки.',
        sortOrder: 50,
        imageUrl: '/categories/discovery-buket-roz.png',
      },
      {
        id: 'bestsellers',
        kind: 'bestsellers',
        enabled: false,
        heading: 'Наши бестселлеры',
        sortOrder: 90,
      },
      {
        id: 'gifts',
        kind: 'gifts',
        enabled: false,
        heading: 'Подарки',
        sortOrder: 91,
      },
      {
        id: 'instagram',
        kind: 'instagram',
        enabled: false,
        heading: 'В Instagram',
        sortOrder: 92,
      },
    ],
    discoveryTiles: defaultHomepageDiscoveryTiles(),
    perks: defaultHomepagePerks(),
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

/** Main storefront navigation — independent of CatalogCategory tree. */
export const NAVIGATION_TARGET_TYPES = [
  'CATEGORY',
  'PROMOTIONS',
  'BESTSELLERS',
  'PAGE',
  'CUSTOM_URL',
  'GROUP',
  'PRODUCT',
] as const;
export type NavigationTargetType = (typeof NAVIGATION_TARGET_TYPES)[number];

/** Named SVG icons available for navigation group headers. */
export const NAVIGATION_ICON_KEYS = [
  'bouquet',
  'flower',
  'leaf',
  'heart',
  'gift',
  'sale',
  'size',
  'color',
  'arrow',
] as const;
export type NavigationIconKey = (typeof NAVIGATION_ICON_KEYS)[number];

export function isNavigationIconKey(value: string): value is NavigationIconKey {
  return (NAVIGATION_ICON_KEYS as readonly string[]).includes(value);
}

/** Dropdown presentation for a root NavigationMenuItem. */
export const NAVIGATION_PANEL_LAYOUTS = ['COLUMNS', 'TILES'] as const;
export type NavigationPanelLayout = (typeof NAVIGATION_PANEL_LAYOUTS)[number];

export function isNavigationPanelLayout(value: string): value is NavigationPanelLayout {
  return (NAVIGATION_PANEL_LAYOUTS as readonly string[]).includes(value);
}

export const NAVIGATION_PAGE_KEYS = [
  'bukety',
  'cvety',
  'povod',
  'dostavka',
  'o-nas',
  'kontakty',
  'akcii',
] as const;
export type NavigationPageKey = (typeof NAVIGATION_PAGE_KEYS)[number];

export const MAIN_NAVIGATION_MENU_KEY = 'main';

export type NavigationMenuItemPublicDto = {
  id: string;
  label: string;
  /** Empty for GROUP headers. */
  href: string;
  accent: boolean;
  openInNewTab: boolean;
  iconKey: string | null;
  /** Meaningful on root items — COLUMNS (text groups) or TILES (photo grid). */
  panelLayout: NavigationPanelLayout;
  /** Resolved public image URL for TILES (or null). */
  imageUrl: string | null;
  targetType: NavigationTargetType;
  children: NavigationMenuItemPublicDto[];
};

export type NavigationMenuPublicDto = {
  key: string;
  items: NavigationMenuItemPublicDto[];
};

export type NavigationMenuItemAdminDto = {
  id: string;
  parentId: string | null;
  label: string;
  targetType: NavigationTargetType;
  targetId: string | null;
  customHref: string | null;
  iconKey: string | null;
  panelLayout: NavigationPanelLayout;
  mediaAssetId: string | null;
  /** Resolved preview image URL (explicit media or PRODUCT primary fallback). */
  imageUrl: string | null;
  /** Resolved preview href for admin UI (may be `#` when unavailable / GROUP). */
  href: string;
  sortOrder: number;
  enabled: boolean;
  openInNewTab: boolean;
  accent: boolean;
  version: number;
  /** Human target summary, e.g. "Категория · Розы". */
  targetLabel: string;
  /**
   * True when the target cannot be shown on the storefront
   * (e.g. CATEGORY → HIDDEN/deleted). Item is kept for admin; storefront hides it.
   */
  unavailable: boolean;
  /** Admin warning when unavailable. */
  unavailableReason: string | null;
  children: NavigationMenuItemAdminDto[];
};

/** Resolve whether a CATEGORY nav target is storefront-visible. */
export function navigationCategoryTargetAvailability(
  category: { name: string; visibility: string } | null | undefined,
): { available: boolean; reason: string | null; targetLabel: string } {
  if (!category) {
    return {
      available: false,
      reason: 'Категория удалена — пункт не показывается на витрине',
      targetLabel: 'Категория · (удалена)',
    };
  }
  if (category.visibility === 'HIDDEN') {
    return {
      available: false,
      reason: 'Категория скрыта — пункт не показывается на витрине',
      targetLabel: `Категория · ${category.name} (скрыта)`,
    };
  }
  return {
    available: true,
    reason: null,
    targetLabel: `Категория · ${category.name}`,
  };
}

export type NavigationMenuAdminDto = {
  id: string;
  key: string;
  name: string;
  version: number;
  items: NavigationMenuItemAdminDto[];
};

export type NavigationTargetOptionDto = {
  id: string;
  label: string;
  /** Preview path for the target. */
  href: string;
};

const PAGE_HREFS: Record<NavigationPageKey, string> = {
  bukety: '/bukety',
  cvety: '/cvety',
  povod: '/povod',
  dostavka: '/dostavka',
  'o-nas': '/o-nas',
  kontakty: '/kontakty',
  akcii: '/akcii',
};

export function isNavigationTargetType(value: string): value is NavigationTargetType {
  return (NAVIGATION_TARGET_TYPES as readonly string[]).includes(value);
}

export function isNavigationPageKey(value: string): value is NavigationPageKey {
  return (NAVIGATION_PAGE_KEYS as readonly string[]).includes(value);
}

export function navigationPageHref(pageKey: string): string | null {
  if (!isNavigationPageKey(pageKey)) return null;
  return PAGE_HREFS[pageKey];
}

/**
 * Validate custom menu href.
 * Internal paths must start with `/` (not `//`). External must be https.
 */
export function validateNavigationCustomHref(raw: string): string {
  const href = raw.trim();
  if (!href) throw new Error('NAV_HREF_EMPTY');
  const lower = href.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    throw new Error('NAV_HREF_UNSAFE');
  }
  if (href.startsWith('/')) {
    if (href.startsWith('//')) throw new Error('NAV_HREF_UNSAFE');
    return href;
  }
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:') throw new Error('NAV_HREF_UNSAFE');
    return url.toString();
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('NAV_HREF_')) throw err;
    throw new Error('NAV_HREF_INVALID');
  }
}

/** Category slug → storefront path (legacy hubs preserved). */
export function categoryPublicHref(slug: string): string {
  if (slug === 'bukety') return '/bukety';
  if (slug === 'cvety') return '/cvety';
  return `/katalog/${encodeURIComponent(slug)}`;
}

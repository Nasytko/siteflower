import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import type {
  HomepageHeroSlideDto,
  HomepageSectionDto,
  ProductListItemDto,
} from '@bouquet-one/contracts';
import {
  getBestsellerGroup,
  getHomepageConfig,
  getStorefrontSettings,
  listBestsellerGroups,
  listCatalogCategoryTree,
  listFlowerTypes,
  listOccasions,
  listProducts,
  listPromotionalProducts,
  listRecipients,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { CategoryNav, filterDiscoveryTiles } from '@/components/storefront/category-nav';
import type { DiscoveryTile } from '@/components/storefront/category-nav-types';
import { ExpandingHero, type HeroSlide } from '@/components/storefront/expanding-hero';
import { HomeAnalytics } from '@/components/storefront/home-analytics';
import { HomePerks } from '@/components/storefront/home-perks';
import { HomeSectionHead } from '@/components/storefront/home-section-head';
import { PopularShelf } from '@/components/storefront/popular-shelf';
import { ProductRow } from '@/components/storefront/product-row';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [homepage, settings] = await Promise.all([getHomepageConfig(), getStorefrontSettings()]);
    const slide =
      homepage.heroSlides?.find((item) => item.enabled) ??
      (homepage.hero
        ? {
            title: homepage.hero.title,
            subtitle: homepage.hero.subtitle,
            imageUrl: homepage.hero.imageUrl,
          }
        : null);
    return buildPageMetadata({
      title: slide?.title || homepage.hero.title,
      description:
        slide?.subtitle ||
        homepage.hero.subtitle ||
        `${settings.brandName} — цветы и доставка в ${settings.city}.`,
      path: '/',
      imageUrl: slide?.imageUrl ?? homepage.hero.imageUrl ?? undefined,
    });
  } catch {
    return buildPageMetadata({
      title: 'Главная',
      description: 'BUKET №1 — цветы и доставка букетов в Гродно.',
      path: '/',
    });
  }
}

function sectionOf(sections: HomepageSectionDto[], kind: HomepageSectionDto['kind']) {
  return sections.find((section) => section.kind === kind);
}

function isSlideLive(slide: HomepageHeroSlideDto, now: Date): boolean {
  if (!slide.enabled) return false;
  if (slide.startsAt) {
    const start = new Date(slide.startsAt);
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }
  if (slide.endsAt) {
    const end = new Date(slide.endsAt);
    if (!Number.isNaN(end.getTime()) && now > end) return false;
  }
  return Boolean(slide.imageUrl || slide.title);
}

function maxPromoPercent(products: ProductListItemDto[]): number | null {
  let max = 0;
  for (const product of products) {
    const value = product.promotion?.percentOff;
    if (typeof value === 'number' && value > max) max = value;
  }
  return max > 0 ? max : null;
}

/** Public listing has no kind filter — over-fetch and keep only the requested kind. */
const KIND_FILTER_PAGE_SIZE = 48;

async function loadShelfProducts(opts: {
  sourceSlug?: string | null;
  limit: number;
  productKind?: ProductListItemDto['productKind'];
  fallback: () => Promise<ProductListItemDto[]>;
}): Promise<ProductListItemDto[]> {
  const keep = (items: ProductListItemDto[]) =>
    (opts.productKind ? items.filter((item) => item.productKind === opts.productKind) : items).slice(
      0,
      opts.limit,
    );
  const pageSize = opts.productKind ? KIND_FILTER_PAGE_SIZE : opts.limit;
  const slug = opts.sourceSlug?.trim();
  if (slug) {
    try {
      const page = await listProducts({ categorySlug: slug, pageSize });
      const items = keep(page.items);
      if (items.length > 0) return items;
    } catch {
      /* try bestseller group */
    }
    try {
      const group = await getBestsellerGroup(slug);
      const items = keep(group.products ?? []);
      if (items.length > 0) return items;
    } catch {
      /* fallback */
    }
  }
  return keep(await opts.fallback());
}

export default async function StorefrontHomePage() {
  const [homepage, settings, flowers, recipients, occasions, categoryTree] = await Promise.all([
    getHomepageConfig().catch(() => null),
    getStorefrontSettings().catch(() => null),
    listFlowerTypes().catch(() => []),
    listRecipients().catch(() => []),
    listOccasions().catch(() => []),
    listCatalogCategoryTree().catch(() => []),
  ]);

  if (!homepage || !settings) {
    return (
      <main id="main-content" className="sf-container py-20">
        <p className="sf-display">BUKET №1</p>
        <p className="sf-body mt-4 text-muted">
          Витрина временно недоступна. Попробуйте обновить страницу чуть позже.
        </p>
        <Link href="/bukety" className="sf-cta mt-8">
          Перейти в каталог
        </Link>
      </main>
    );
  }

  const now = new Date();
  const telHref = settings.phone ? `tel:${settings.phone.replace(/\s+/g, '')}` : null;

  const configuredTiles: DiscoveryTile[] = [...(homepage.discoveryTiles ?? [])]
    .filter((tile) => tile.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((tile) => ({
      id: tile.id,
      label: tile.label,
      href: tile.href,
      imageSrc: tile.imageUrl,
      imageAlt: tile.imageAlt || tile.label,
    }));

  const catalogSlugs = new Set<string>();
  const walkCategories = (nodes: typeof categoryTree) => {
    for (const node of nodes) {
      if (node.slug && node.visibility !== 'HIDDEN') catalogSlugs.add(node.slug);
      if (node.children?.length) walkCategories(node.children);
    }
  };
  walkCategories(categoryTree);

  const discoveryTiles = filterDiscoveryTiles(configuredTiles, {
    flowerSlugs: new Set(flowers.map((item) => item.slug)),
    recipientSlugs: new Set(recipients.map((item) => item.slug)),
    occasionSlugs: new Set(occasions.map((item) => item.slug)),
    catalogSlugs,
  }).slice(0, 7);

  const sections = [...homepage.sections].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );

  const promoSection = sectionOf(sections, 'promotions');
  const autumnSection = sectionOf(sections, 'autumn');
  const popularSection =
    sectionOf(sections, 'popular') ?? sectionOf(sections, 'bestsellers');
  const rosesSection = sectionOf(sections, 'roses');
  const helpSection = sectionOf(sections, 'help');

  const heroSlidesSource =
    homepage.heroSlides?.length > 0
      ? homepage.heroSlides
      : [
          {
            id: 'legacy',
            title: homepage.hero.title,
            subtitle: homepage.hero.subtitle,
            imageUrl: homepage.hero.imageUrl,
            mobileImageUrl: null,
            ctaLabel: homepage.hero.ctaLabel,
            ctaHref: homepage.hero.ctaHref,
            enabled: true,
            sortOrder: 10,
            startsAt: null,
            endsAt: null,
          } satisfies HomepageHeroSlideDto,
        ];

  const heroSlides: HeroSlide[] = heroSlidesSource
    .filter((slide) => isSlideLive(slide, now))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((slide) => ({
      id: slide.id,
      title: slide.title,
      subtitle: slide.subtitle,
      ctaLabel: slide.ctaLabel,
      ctaHref: slide.ctaHref,
      imageUrl: slide.imageUrl || '/categories/hero.jpg',
      mobileImageUrl: slide.mobileImageUrl,
    }));

  const promoLimit = promoSection?.limit ?? 5;
  const autumnLimit = autumnSection?.limit ?? 5;
  const popularLimit = popularSection?.limit ?? 10;
  const rosesLimit = rosesSection?.limit ?? 5;

  const [promoProducts, autumnProducts, popularProducts, authorialProducts, rosesProducts] =
    await Promise.all([
      promoSection?.enabled
        ? listPromotionalProducts(promoLimit).catch(() => [])
        : Promise.resolve([] as ProductListItemDto[]),
      autumnSection?.enabled
        ? loadShelfProducts({
            sourceSlug: autumnSection.sourceSlug,
            limit: autumnLimit,
            fallback: async () => {
              const page = await listProducts({ categorySlug: 'bukety', pageSize: autumnLimit });
              return page.items;
            },
          }).catch(() => [])
        : Promise.resolve([] as ProductListItemDto[]),
      popularSection?.enabled
        ? loadShelfProducts({
            sourceSlug: popularSection.sourceSlug,
            limit: popularLimit,
            fallback: async () => {
              const groups = await listBestsellerGroups().catch(() => []);
              const first = groups.find(
                (g) => g.slug !== 'podarki' && (g.products?.length ?? 0) > 0,
              );
              if (first?.products?.length) return first.products.slice(0, popularLimit);
              const page = await listProducts({ categorySlug: 'bukety', pageSize: popularLimit });
              return page.items;
            },
          }).catch(() => [])
        : Promise.resolve([] as ProductListItemDto[]),
      popularSection?.enabled
        ? listProducts({ categorySlug: 'avtorskie-bukety', pageSize: popularLimit })
            .then((page) => page.items)
            .catch(() => [] as ProductListItemDto[])
        : Promise.resolve([] as ProductListItemDto[]),
      rosesSection?.enabled
        ? loadShelfProducts({
            sourceSlug: rosesSection.sourceSlug ?? 'rozy',
            limit: rosesLimit,
            productKind: 'STEM',
            fallback: async () => {
              const page = await listProducts({
                flowerTypeSlug: 'roza',
                pageSize: KIND_FILTER_PAGE_SIZE,
              });
              return page.items;
            },
          }).catch(() => [])
        : Promise.resolve([] as ProductListItemDto[]),
    ]);

  const promoBadgePercent = maxPromoPercent(promoProducts);
  const hasMessenger = Boolean(settings.telegramUrl || settings.instagramUrl);
  const helpPoints: Array<{ id: HelpIconName; label: string }> = [
    { id: 'consult', label: 'Персональная консультация' },
    { id: 'budget', label: 'Подбор по поводу и бюджету' },
    hasMessenger
      ? { id: 'chat', label: 'Быстрый ответ в мессенджерах' }
      : { id: 'chat', label: 'Быстрый ответ по телефону' },
  ];

  return (
    <main id="main-content" className="sf-home">
      <HomeAnalytics />

      <ExpandingHero
        slides={heroSlides}
        deliveryNote={
          settings.deliverySummary?.trim()
            ? `Доставка по ${settings.city} и области`
            : null
        }
      />

      <CategoryNav items={discoveryTiles} />

      <HomePerks items={homepage.perks ?? []} />

      {promoSection?.enabled && promoProducts.length > 0 ? (
        <section className="sf-home-shelf">
          <div className="sf-container-wide">
            <HomeSectionHead
              title={promoSection.heading || 'Акционные товары'}
              href={promoSection.viewAllHref || '/akcii'}
              badge={promoBadgePercent ? `Скидки до −${promoBadgePercent}%` : null}
            />
            <ProductRow products={promoProducts.slice(0, promoLimit)} tone="promo" />
          </div>
        </section>
      ) : null}

      {autumnSection?.enabled && autumnProducts.length > 0 ? (
        <section
          className={
            autumnSection.theme === 'default' ? 'sf-home-shelf' : 'sf-autumn'
          }
        >
          {autumnSection.theme === 'default' ? null : (
            <>
              <span className="sf-autumn__leaves sf-autumn__leaves--left" aria-hidden />
              <span className="sf-autumn__leaves sf-autumn__leaves--right" aria-hidden />
            </>
          )}
          <div className="sf-container-wide">
            <div className="sf-autumn__layout">
              <div className="sf-autumn__intro">
                <p className="sf-autumn__kicker">Сезонная подборка</p>
                <h2 className="sf-autumn__title">{autumnSection.heading}</h2>
                {autumnSection.body ? (
                  <p className="sf-autumn__body">{autumnSection.body}</p>
                ) : null}
                {autumnSection.viewAllHref ? (
                  <Link href={autumnSection.viewAllHref} className="sf-home-btn sf-autumn__cta">
                    Смотреть все <span aria-hidden>→</span>
                  </Link>
                ) : null}
              </div>
              <ProductRow products={autumnProducts.slice(0, autumnLimit)} tone="seasonal" />
            </div>
          </div>
        </section>
      ) : null}

      {popularSection?.enabled && popularProducts.length > 0 ? (
        <PopularShelf
          title={popularSection.heading || 'Популярные букеты'}
          viewAllHref={popularSection.viewAllHref || '/bukety'}
          products={popularProducts}
          authorialProducts={authorialProducts}
          limit={popularLimit}
        />
      ) : null}

      {rosesSection?.enabled && rosesProducts.length > 0 ? (
        <section className="sf-home-shelf">
          <div className="sf-container-wide">
            <HomeSectionHead
              title={rosesSection.heading || 'Розы'}
              href={rosesSection.viewAllHref || '/katalog/rozy'}
              subtitle={rosesSection.body || 'Классика, которая всегда актуальна'}
            />
            <ProductRow products={rosesProducts.slice(0, rosesLimit)} />
          </div>
        </section>
      ) : null}

      {helpSection?.enabled ? (
        <section className="sf-help-band">
          <div className="sf-container-wide">
            <div className="sf-help-band__card">
              <div className="sf-help-band__copy">
                <h2 className="sf-help-band__title">{helpSection.heading}</h2>
                <p className="sf-help-band__body">
                  {helpSection.body ||
                    'Подскажем по поводу, бюджету и сроку — напишите или позвоните.'}
                </p>
                <div className="sf-help-band__actions">
                  <Link href="/bukety" className="sf-home-btn">
                    Получить подборку
                  </Link>
                  {telHref ? (
                    <a href={telHref} className="sf-home-btn sf-home-btn--light">
                      Позвонить
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="sf-help-band__media">
                <Image
                  src={helpSection.imageUrl || '/categories/discovery-buket-roz.png'}
                  alt=""
                  fill
                  sizes="(max-width: 900px) 100vw, 26rem"
                  className="object-cover"
                />
              </div>
              <ul className="sf-help-band__aside" aria-label="Как мы помогаем">
                {helpPoints.map((point) => (
                  <li key={point.id} className="sf-help-band__point">
                    <HelpIcon name={point.id} />
                    <span>{point.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

type HelpIconName = 'consult' | 'budget' | 'chat';

function HelpIcon({ name }: { name: HelpIconName }) {
  const common = {
    viewBox: '0 0 24 24',
    className: 'sf-help-band__icon',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'consult':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
          <path d="M15.5 5.2a3 3 0 0 1 0 5.6M17 14.2c1.9.6 3.1 2.2 3.5 4.8" />
        </svg>
      );
    case 'budget':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="14" height="15" rx="2.5" />
          <path d="m8 12.5 2.2 2.2L14.5 10" />
          <path d="M18 3.5v4M16 5.5h4" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4A8 8 0 1 1 20 11.5Z" />
          <path d="M9.5 9.5c.3 2 1.8 3.6 3.9 4.1l1.1-1.1" />
        </svg>
      );
  }
}

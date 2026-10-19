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
import { ProductRow } from '@/components/storefront/product-row';
import { SectionRail } from '@/components/storefront/section-rail';

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

async function loadShelfProducts(opts: {
  sourceSlug?: string | null;
  limit: number;
  fallback: () => Promise<ProductListItemDto[]>;
}): Promise<ProductListItemDto[]> {
  const slug = opts.sourceSlug?.trim();
  if (slug) {
    try {
      const page = await listProducts({ categorySlug: slug, pageSize: opts.limit });
      if (page.items.length > 0) return page.items;
    } catch {
      /* try bestseller group */
    }
    try {
      const group = await getBestsellerGroup(slug);
      if (group.products?.length) return group.products.slice(0, opts.limit);
    } catch {
      /* fallback */
    }
  }
  return opts.fallback();
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

  const [promoProducts, autumnProducts, popularProducts, rosesProducts] = await Promise.all([
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
            const first = groups.find((g) => g.slug !== 'podarki' && (g.products?.length ?? 0) > 0);
            if (first?.products?.length) return first.products.slice(0, popularLimit);
            const page = await listProducts({ categorySlug: 'bukety', pageSize: popularLimit });
            return page.items;
          },
        }).catch(() => [])
      : Promise.resolve([] as ProductListItemDto[]),
    rosesSection?.enabled
      ? loadShelfProducts({
          sourceSlug: rosesSection.sourceSlug ?? 'rozy',
          limit: rosesLimit,
          fallback: async () => {
            const page = await listProducts({
              productKind: 'STEM',
              flowerTypeSlug: 'roza',
              pageSize: rosesLimit,
            });
            return page.items;
          },
        }).catch(() => [])
      : Promise.resolve([] as ProductListItemDto[]),
  ]);

  return (
    <main id="main-content">
      <HomeAnalytics />

      <ExpandingHero slides={heroSlides} />

      <CategoryNav items={discoveryTiles} />

      <HomePerks items={homepage.perks ?? []} />

      {promoSection?.enabled && promoProducts.length > 0 ? (
        <section className="py-10 md:py-14">
          <div className="sf-container-wide">
            <SectionRail
              title={promoSection.heading || 'Акционные товары'}
              href={promoSection.viewAllHref || '/akcii'}
              linkLabel="Смотреть все"
            />
            <ProductRow products={promoProducts.slice(0, promoLimit)} />
          </div>
        </section>
      ) : null}

      {autumnSection?.enabled && autumnProducts.length > 0 ? (
        <section
          className={
            autumnSection.theme === 'default' ? 'py-10 md:py-14' : 'sf-autumn'
          }
        >
          <div className="sf-container-wide">
            <div className="sf-autumn__layout">
              <div className="sf-autumn__intro">
                <h2 className="sf-autumn__title">{autumnSection.heading}</h2>
                {autumnSection.body ? (
                  <p className="sf-autumn__body">{autumnSection.body}</p>
                ) : null}
                {autumnSection.viewAllHref ? (
                  <Link href={autumnSection.viewAllHref} className="sf-cta sf-autumn__cta">
                    Смотреть все
                  </Link>
                ) : null}
              </div>
              <ProductRow products={autumnProducts.slice(0, autumnLimit)} />
            </div>
          </div>
        </section>
      ) : null}

      {popularSection?.enabled && popularProducts.length > 0 ? (
        <section className="py-10 md:py-14">
          <div className="sf-container-wide">
            <SectionRail
              title={popularSection.heading || 'Популярные букеты'}
              href={popularSection.viewAllHref || '/bukety'}
              linkLabel="Смотреть все"
            />
            <ProductRow
              products={popularProducts.slice(0, popularLimit)}
              scrollOnMobile={false}
            />
          </div>
        </section>
      ) : null}

      {rosesSection?.enabled && rosesProducts.length > 0 ? (
        <section className="py-10 md:py-14">
          <div className="sf-container-wide">
            <SectionRail
              title={rosesSection.heading || 'Розы'}
              href={rosesSection.viewAllHref || '/katalog/rozy'}
              linkLabel="Смотреть все"
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
                <h2 className="sf-h2">{helpSection.heading}</h2>
                {helpSection.body ? (
                  <p className="sf-body mt-3 text-muted">{helpSection.body}</p>
                ) : (
                  <p className="sf-body mt-3 text-muted">
                    Подскажем по поводу, бюджету и сроку — или откройте каталог.
                  </p>
                )}
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link href="/bukety" className="sf-cta">
                    Получить подборку
                  </Link>
                  {telHref ? (
                    <a href={telHref} className="sf-cta-ghost">
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
                  sizes="(max-width: 800px) 100vw, 40vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

    </main>
  );
}

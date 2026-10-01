import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getBestsellerGroup,
  getHomepageConfig,
  getInstagramFeed,
  getStorefrontSettings,
  listBestsellerGroups,
  listBudgetRanges,
  listFlowers,
  listOccasions,
  listPromotionalProducts,
  listRecipients,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { BestsellersSection } from '@/components/storefront/bestsellers-section';
import {
  CategoryNav,
  filterDiscoveryTiles,
  HOME_DISCOVERY_TILES,
} from '@/components/storefront/category-nav';
import { ExpandingHero, type HeroSlide } from '@/components/storefront/expanding-hero';
import { HomeAnalytics } from '@/components/storefront/home-analytics';
import { InstagramSection } from '@/components/storefront/instagram-section';
import { ProductGrid } from '@/components/storefront/product-grid';
import { Reveal } from '@/components/storefront/reveal';
import { SectionRail } from '@/components/storefront/section-rail';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [homepage, settings] = await Promise.all([getHomepageConfig(), getStorefrontSettings()]);
    return buildPageMetadata({
      title: homepage.hero.title,
      description:
        homepage.hero.subtitle || `${settings.brandName} — цветы и доставка в ${settings.city}.`,
      path: '/',
      imageUrl: homepage.hero.imageUrl ?? undefined,
    });
  } catch {
    return buildPageMetadata({
      title: 'Главная',
      description: 'BUKET №1 — цветы и доставка букетов в Гродно.',
      path: '/',
    });
  }
}

export default async function StorefrontHomePage() {
  const [
    homepage,
    settings,
    bestsellerGroups,
    promoProducts,
    giftsShelf,
    budgets,
    recipients,
    flowers,
    occasions,
    instagram,
  ] = await Promise.all([
      getHomepageConfig().catch(() => null),
      getStorefrontSettings().catch(() => null),
      listBestsellerGroups().catch(() => []),
      listPromotionalProducts(8).catch(() => []),
      getBestsellerGroup('podarki').catch(() => null),
      listBudgetRanges().catch(() => []),
      listRecipients().catch(() => []),
      listFlowers().catch(() => []),
      listOccasions().catch(() => []),
      getInstagramFeed().catch(() => null),
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

  const discoveryTiles = filterDiscoveryTiles(HOME_DISCOVERY_TILES, {
    flowerSlugs: new Set(flowers.map((item) => item.slug)),
    recipientSlugs: new Set(recipients.map((item) => item.slug)),
    occasionSlugs: new Set(occasions.map((item) => item.slug)),
  });

  const sections = [...homepage.sections]
    .filter((section) => section.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const hero = homepage.hero;
  const brandName = settings.brandName || 'BUKET №1';
  const heroImage = hero.imageUrl || '/categories/hero.jpg';
  const giftProducts = giftsShelf?.products ?? [];
  const giftsConfig = homepage.sections.find((section) => section.kind === 'gifts');

  const heroSlides: HeroSlide[] = [
    {
      id: 'main',
      brandName,
      title: hero.title || 'Цветы, которые хочется дарить',
      subtitle:
        hero.subtitle || `${brandName} — свежие букеты с доставкой по ${settings.city}.`,
      ctaLabel: hero.ctaLabel || 'Выбрать букет',
      ctaHref: hero.ctaHref || '/bukety',
      imageUrl: heroImage,
    },
    {
      id: 'akcii',
      brandName,
      title: 'Сейчас на акции',
      subtitle: `Скидки на букеты — покажите заботу без лишних слов. Доставка по ${settings.city}.`,
      ctaLabel: 'Смотреть акции',
      ctaHref: '/akcii',
      imageUrl: '/categories/discovery-buket-roz.png',
    },
    {
      id: 'podarki',
      brandName,
      title: 'Букет как подарок',
      subtitle: 'С открыткой и аккуратной сборкой — чтобы вручение прошло спокойно.',
      ctaLabel: 'К подаркам',
      ctaHref: '/bukety',
      imageUrl: '/categories/discovery-podarki.png',
    },
  ];

  /** Fixed editorial rhythm: promo → discovery → bestsellers → gifts → rest. */
  const promotionsSection = sections.find((section) => section.kind === 'promotions');
  const bestsellersSection = sections.find((section) => section.kind === 'bestsellers');
  // Read from raw config (not the enabled-only list) so a disabled section stays hidden.
  const instagramSection = homepage.sections.find((section) => section.kind === 'instagram');
  const showGifts = giftProducts.length > 0 && giftsConfig?.enabled !== false;
  const showInstagram =
    instagram != null &&
    instagram.posts.length > 0 &&
    (instagramSection ? instagramSection.enabled : true);
  const trailing = sections.filter(
    (section) =>
      section.kind !== 'promotions' &&
      section.kind !== 'bestsellers' &&
      section.kind !== 'gifts' &&
      section.kind !== 'instagram',
  );

  return (
    <main id="main-content">
      <HomeAnalytics />

      <ExpandingHero slides={heroSlides} />

      <section className="sf-promo-band py-10 md:py-14">
        <div className="sf-container-wide">
          <SectionRail
            title={promotionsSection?.heading || 'Акции сейчас'}
            href="/akcii"
            linkLabel="Смотреть все"
          />
          {promoProducts.length > 0 ? (
            <ProductGrid products={promoProducts.slice(0, 4)} priorityCount={0} />
          ) : (
            <div className="rounded-[var(--radius-xl)] border border-border bg-surface px-6 py-10 text-center md:px-10">
              <p className="sf-body text-muted">
                Акционные букеты появятся здесь — пока можно выбрать из каталога.
              </p>
              <Link href="/bukety" className="sf-cta mt-6 inline-flex">
                Открыть каталог
              </Link>
            </div>
          )}
        </div>
      </section>

      <CategoryNav city={settings.city} items={discoveryTiles} />

      {bestsellersSection ? (
        <BestsellersSection
          heading={bestsellersSection.heading || 'Наши бестселлеры'}
          groups={bestsellerGroups.filter((group) => group.slug !== 'podarki')}
        />
      ) : null}

      {showGifts ? (
        <section className="py-12 md:py-16">
          <div className="sf-container-wide">
            <SectionRail
              title={giftsConfig?.heading || 'Подарки'}
              href="/bukety"
              linkLabel="Смотреть все"
            />
            <ProductGrid products={giftProducts.slice(0, 4)} priorityCount={0} />
          </div>
        </section>
      ) : null}

      {showInstagram && instagram ? (
        <InstagramSection
          feed={instagram}
          heading={
            instagramSection?.heading
              ? `${brandName} ${instagramSection.heading}`
              : `${brandName} в Instagram`
          }
        />
      ) : null}

      {trailing.map((section) => {
        switch (section.kind) {
          case 'discovery':
            if (budgets.length === 0 && recipients.length === 0) return null;
            return (
              <section key={section.id} className="sf-container-wide py-12 md:py-14">
                <Reveal>
                  <SectionRail
                    title={section.heading || 'С чего начать'}
                    href="/bukety"
                    linkLabel="Смотреть все"
                  />
                </Reveal>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {budgets.slice(0, 4).map((range) => (
                    <li key={range.id}>
                      <Link
                        href={`/bukety?budget=${encodeURIComponent(range.id)}`}
                        className="sf-tile flex min-h-[4.75rem] flex-col justify-between p-4"
                      >
                        <span className="sf-label text-[0.65rem]">Бюджет</span>
                        <span className="text-lg font-semibold">{range.label}</span>
                      </Link>
                    </li>
                  ))}
                  {recipients.slice(0, 4).map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/bukety?recipient=${item.slug}`}
                        className="sf-tile sf-tile--ink flex min-h-[4.75rem] flex-col justify-between p-4"
                      >
                        <span className="sf-label text-[0.65rem] text-white/60">Кому</span>
                        <span className="text-lg font-semibold">{item.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );

          case 'recipients':
            if (recipients.length === 0) return null;
            return (
              <section key={section.id} className="sf-container-wide py-12 md:py-14">
                <SectionRail
                  title={section.heading || 'Кому подарить'}
                  href="/bukety"
                  linkLabel="Смотреть все"
                />
                <ul className="flex flex-wrap gap-2">
                  {recipients.map((item) => (
                    <li key={item.id}>
                      <Link href={`/komu/${item.slug}`} className="sf-chip">
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );

          case 'help':
            return (
              <section key={section.id} className="sf-container-wide py-12 md:py-16">
                <div className="sf-panel mx-auto max-w-3xl px-6 py-10 text-center md:px-10">
                  <h2 className="sf-h2">{section.heading || 'Не знаете, что выбрать?'}</h2>
                  <p className="sf-body mt-3 text-muted">
                    Напишите повод и бюджет — подскажем 2–3 букета без лишнего.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <Link href="/bukety" className="sf-cta">
                      Открыть каталог
                    </Link>
                    {settings.phone ? (
                      <a href={`tel:${settings.phone.replace(/\s/g, '')}`} className="sf-cta-ghost">
                        Позвонить
                      </a>
                    ) : null}
                  </div>
                </div>
              </section>
            );

          default:
            return null;
        }
      })}
    </main>
  );
}

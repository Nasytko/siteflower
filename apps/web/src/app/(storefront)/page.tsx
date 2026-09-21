import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getCollection,
  getHomepageConfig,
  getStorefrontSettings,
  listOccasions,
  listProducts,
  listRecipients,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { CategoryNav } from '@/components/storefront/category-nav';
import { HomeAnalytics } from '@/components/storefront/home-analytics';
import { ProductGrid } from '@/components/storefront/product-grid';
import { PRICE_BANDS } from '@/lib/media';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [homepage, settings] = await Promise.all([getHomepageConfig(), getStorefrontSettings()]);
    return buildPageMetadata({
      title: homepage.hero.title,
      description: homepage.hero.subtitle || `${settings.brandName} — цветы и доставка в ${settings.city}.`,
      path: '/',
      imageUrl: homepage.hero.imageUrl ?? undefined,
    });
  } catch {
    return buildPageMetadata({
      title: 'Главная',
      description: 'БУКЕТ №1 — цветы и доставка букетов в Гродно.',
      path: '/',
    });
  }
}

export default async function StorefrontHomePage() {
  const [homepage, settings, featured, occasions, recipients] = await Promise.all([
    getHomepageConfig().catch(() => null),
    getStorefrontSettings().catch(() => null),
    listProducts({ featured: true, pageSize: 8, sort: 'featured' }).catch(() => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 8,
    })),
    listOccasions().catch(() => []),
    listRecipients().catch(() => []),
  ]);

  if (!homepage || !settings) {
    return (
      <main id="main-content" className="sf-container py-20">
        <p className="sf-display">БУКЕТ №1</p>
        <p className="sf-body mt-4 text-muted">
          Витрина временно недоступна. Попробуйте обновить страницу чуть позже.
        </p>
        <Link href="/bukety" className="mt-8 inline-flex text-sm font-medium text-brand">
          Перейти в каталог
        </Link>
      </main>
    );
  }

  const sections = [...homepage.sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const hero = homepage.hero;
  const brandName = settings.brandName || 'БУКЕТ №1';
  const heroImage = hero.imageUrl || '/categories/hero.jpg';

  return (
    <main id="main-content">
      <HomeAnalytics />

      <section className="relative isolate min-h-[72vh] overflow-hidden md:min-h-[78vh]">
        <Image
          src={heroImage}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          className="absolute inset-0 bg-foreground/30 md:bg-foreground/25"
          aria-hidden
        />

        <div className="relative z-10 flex min-h-[72vh] flex-col items-center justify-center px-6 py-24 text-center text-white md:min-h-[78vh]">
          <p className="sf-label mb-4 tracking-[0.2em] text-white/80">
            {brandName} · {settings.city}
          </p>
          <h1 className="sf-display sf-animate-in max-w-4xl drop-shadow-sm">
            {hero.title || 'Свежие, местные, сезонные'}
          </h1>
          {hero.subtitle ? (
            <p className="sf-display-script sf-animate-in-delay mt-4 max-w-xl text-white/95">
              {hero.subtitle}
            </p>
          ) : (
            <p className="sf-display-script sf-animate-in-delay mt-4 text-white/95">
              с любовью собираем для вас
            </p>
          )}
          <div className="sf-animate-in-delay mt-10">
            <Link
              href={hero.ctaHref || '/bukety'}
              className="inline-flex min-h-12 items-center border border-white/80 bg-white/10 px-8 py-3 text-sm font-medium tracking-[0.12em] uppercase text-white backdrop-blur-sm transition hover:bg-white hover:text-foreground"
            >
              {hero.ctaLabel || 'Выбрать букет'}
            </Link>
          </div>
        </div>
      </section>

      <CategoryNav city={settings.city} />

      {sections.map((section) => {
        switch (section.kind) {
          case 'featured':
            return (
              <section key={section.id} className="sf-container-wide py-16 md:py-24">
                <div className="mb-10 flex flex-col gap-2 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="sf-label mb-2">Лидеры продаж</p>
                    <h2 className="sf-h2">{section.heading}</h2>
                  </div>
                  <p className="sf-small text-muted">
                    Доставка цветов в {settings.city}
                  </p>
                </div>
                <ProductGrid products={featured.items} />
                <div className="mt-12 text-center">
                  <Link
                    href="/bukety"
                    className="sf-nav-link inline-flex border-b border-foreground/30 pb-1 text-foreground transition hover:border-brand hover:text-brand"
                  >
                    Весь каталог
                  </Link>
                </div>
              </section>
            );

          case 'discovery':
            return (
              <section key={section.id} className="border-y border-border/80 bg-surface py-16 md:py-20">
                <div className="sf-container-wide">
                  <div className="mx-auto max-w-2xl text-center">
                    <p className="sf-label mb-3">Быстрый подбор</p>
                    <h2 className="sf-h2">{section.heading}</h2>
                    <p className="sf-body mt-3 text-muted">
                      Выберите бюджет или кому дарите — покажем подходящие букеты.
                    </p>
                  </div>
                  <ul className="mt-10 flex flex-wrap justify-center gap-2.5">
                    {PRICE_BANDS.map((band) => (
                      <li key={band.id}>
                        <Link
                          href={`/bukety?band=${band.id}`}
                          className="inline-flex border border-border bg-background px-4 py-2.5 text-sm tracking-wide text-foreground transition hover:border-brand hover:text-brand"
                        >
                          {band.label}
                        </Link>
                      </li>
                    ))}
                    {recipients.slice(0, 4).map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/bukety?recipient=${item.slug}`}
                          className="inline-flex border border-border bg-background px-4 py-2.5 text-sm tracking-wide text-foreground transition hover:border-brand hover:text-brand"
                        >
                          {item.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );

          case 'occasions':
            return (
              <section key={section.id} className="sf-container-wide py-16 md:py-24">
                <div className="mx-auto max-w-xl text-center">
                  <p className="sf-label mb-3">Настроение дня</p>
                  <h2 className="sf-h2">{section.heading}</h2>
                </div>
                <ul className="mt-12 grid gap-px bg-border sm:grid-cols-2 md:grid-cols-3">
                  {occasions.map((item) => (
                    <li key={item.id} className="bg-background">
                      <Link
                        href={`/povod/${item.slug}`}
                        className="flex min-h-24 items-center justify-center px-6 py-8 text-center font-[family-name:var(--font-display)] text-xl tracking-wide text-foreground transition hover:bg-surface hover:text-brand"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );

          case 'recipients':
            return (
              <section key={section.id} className="bg-surface py-16 md:py-24">
                <div className="sf-container-wide">
                  <div className="mx-auto max-w-xl text-center">
                    <p className="sf-label mb-3">С теплом</p>
                    <h2 className="sf-h2">{section.heading}</h2>
                  </div>
                  <ul className="mt-12 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {recipients.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/komu/${item.slug}`}
                          className="block border border-border bg-background px-6 py-8 text-center font-[family-name:var(--font-display)] text-xl tracking-wide transition hover:border-brand hover:shadow-[var(--shadow-soft)]"
                        >
                          {item.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );

          case 'collection':
            return (
              <CollectionSection
                key={section.id}
                heading={section.heading}
                slug={section.collectionSlug ?? null}
                city={settings.city}
              />
            );

          case 'help':
            return (
              <section key={section.id} className="relative overflow-hidden py-20 md:py-28">
                <div
                  className="absolute inset-0 bg-gradient-to-br from-brand-soft via-surface to-[#f0e8e0]"
                  aria-hidden
                />
                <div className="sf-container relative z-10 max-w-2xl text-center">
                  <p className="sf-label mb-3">Нужна подсказка?</p>
                  <h2 className="sf-h2">{section.heading}</h2>
                  <p className="sf-body mt-4 text-muted">
                    Подскажем по цене, поводу и настроению — через простой подбор в каталоге
                    или по телефону.
                  </p>
                  <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                    <Link
                      href="/bukety"
                      className="inline-flex min-h-12 items-center bg-brand px-7 py-3 text-sm font-medium tracking-[0.1em] uppercase text-brand-foreground transition hover:opacity-90"
                    >
                      Помочь выбрать
                    </Link>
                    {settings.phone ? (
                      <a
                        href={`tel:${settings.phone.replace(/\s+/g, '')}`}
                        className="sf-display-script text-2xl text-foreground underline-offset-4 hover:underline"
                      >
                        {settings.phone}
                      </a>
                    ) : null}
                  </div>
                </div>
              </section>
            );

          case 'delivery':
            return (
              <section key={section.id} className="sf-container-wide py-16 md:py-24">
                <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
                  <div>
                    <p className="sf-label mb-3">Как получаете</p>
                    <h2 className="sf-h2">{section.heading}</h2>
                    <p className="sf-body mt-5 max-w-md text-muted">
                      {settings.deliverySummary ??
                        'Доставляем букеты по Гродно. После оформления заказа менеджер свяжется для подтверждения деталей.'}
                    </p>
                    <Link
                      href="/dostavka"
                      className="sf-nav-link mt-8 inline-flex border-b border-foreground/30 pb-1 text-foreground transition hover:border-brand hover:text-brand"
                    >
                      Подробнее о доставке
                    </Link>
                  </div>
                  <div className="border border-border bg-surface px-8 py-10 md:px-10 md:py-12">
                    <p className="sf-display-script text-2xl text-foreground md:text-3xl">
                      свежие цветы каждый день
                    </p>
                    <p className="sf-body mt-4 text-muted">
                      Собираем букеты в день доставки. Если нужна замена отдельных цветов —
                      согласуем заранее.
                    </p>
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

async function CollectionSection({
  heading,
  slug,
  city,
}: {
  heading: string;
  slug: string | null;
  city: string;
}) {
  if (!slug) return null;
  try {
    const collection = await getCollection(slug);
    return (
      <section className="sf-container-wide py-16 md:py-24">
        <div className="mb-10 flex flex-col gap-2 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="sf-label mb-2">Коллекция</p>
            <h2 className="sf-h2">{heading || collection.name}</h2>
          </div>
          <div className="flex items-center gap-4">
            <p className="sf-small text-muted">{city}</p>
            <Link
              href={`/collections/${collection.slug}`}
              className="sf-nav-link text-[0.8rem] text-brand hover:underline"
            >
              Смотреть все
            </Link>
          </div>
        </div>
        <ProductGrid products={collection.products.slice(0, 8)} />
      </section>
    );
  } catch {
    return null;
  }
}

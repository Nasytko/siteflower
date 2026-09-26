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
import { BestsellersSection } from '@/components/storefront/bestsellers-section';
import { CategoryNav } from '@/components/storefront/category-nav';
import { HomeAnalytics } from '@/components/storefront/home-analytics';
import { ProductGrid } from '@/components/storefront/product-grid';
import { Reveal } from '@/components/storefront/reveal';
import { TrustBar } from '@/components/storefront/trust-bar';
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
  const [homepage, settings, featured, catalog, occasions, recipients] = await Promise.all([
    getHomepageConfig().catch(() => null),
    getStorefrontSettings().catch(() => null),
    listProducts({ featured: true, pageSize: 8, sort: 'featured' }).catch(() => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 8,
    })),
    listProducts({ pageSize: 16, sort: 'featured' }).catch(() => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 16,
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
        <Link href="/bukety" className="sf-cta mt-8">
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
  const headline = hero.title || 'Заказывайте цветы сегодня';
  const bestsellerSource = catalog.items.length > 0 ? catalog.items : featured.items;

  return (
    <main id="main-content">
      <HomeAnalytics />

      {/* Dicentra-like split hero */}
      <section className="relative">
        <div className="grid md:min-h-[28rem] md:grid-cols-[minmax(16rem,34%)_1fr] lg:min-h-[32rem]">
          <aside
            className="flex flex-col justify-center px-7 py-12 text-white sm:px-10 md:px-12"
            style={{ background: 'var(--hero-panel)' }}
          >
            <h1 className="sf-animate-in max-w-xs text-[clamp(1.65rem,3.2vw,2.35rem)] font-semibold leading-tight">
              {headline}
            </h1>
            <p className="sf-body sf-animate-in-delay mt-4 max-w-sm text-white/75">
              {hero.subtitle ||
                `${brandName} — свежие букеты с доставкой по ${settings.city}.`}
            </p>
            <Link href={hero.ctaHref || '/bukety'} className="sf-cta-beige sf-animate-in-late mt-8 w-fit">
              {hero.ctaLabel || 'здесь'}
            </Link>
          </aside>

          <div className="relative min-h-[16rem] sm:min-h-[20rem] md:min-h-full">
            <Image
              src={heroImage}
              alt=""
              fill
              priority
              sizes="(max-width: 768px) 100vw, 66vw"
              className="sf-hero-media object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-transparent" aria-hidden />
            <div className="absolute inset-x-6 bottom-8 max-w-md text-white sm:inset-x-10 sm:bottom-12">
              <p className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-none tracking-tight">
                Live now
              </p>
              <p className="mt-2 text-sm text-white/90 sm:text-base">
                не откладывайте любовь на завтра
              </p>
            </div>
          </div>
        </div>
      </section>

      <TrustBar city={settings.city} />

      <CategoryNav city={settings.city} />

      {featured.items.length > 0 ? (
        <section className="sf-container-wide py-12 md:py-14">
          <div className="sf-section-title">
            <h2 className="sf-h2">Акционные предложения</h2>
          </div>
          <ProductGrid products={featured.items.slice(0, 8)} />
          <div className="mt-8 text-center">
            <Link href="/bukety?featured=1" className="sf-cta-ghost">
              Все предложения
            </Link>
          </div>
        </section>
      ) : null}

      <BestsellersSection products={bestsellerSource} />

      {/* Staggered story blocks */}
      <section className="sf-container-wide py-12 md:py-16">
        <h2 className="sf-h2 mx-auto mb-10 max-w-3xl text-center md:mb-14">
          Мы создали {brandName} для того, чтобы вам не пришлось думать, как лучше выразить свои
          чувства.
        </h2>
        <div className="grid items-start gap-8 md:grid-cols-2 md:gap-10">
          <Reveal>
            <div className="md:mt-16">
              <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-lg)] bg-surface">
                <Image
                  src="/categories/box.jpg"
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
              <h3 className="sf-h3 mt-5 text-lg">Дом ваших цветов</h3>
              <p className="sf-body mt-2 text-muted">
                Студия в {settings.city}: свежая сборка, аккуратная упаковка и доставка в день
                заказа.
              </p>
            </div>
          </Reveal>
          <Reveal delayMs={80}>
            <div>
              <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-lg)] bg-surface md:aspect-[5/6]">
                <Image
                  src="/categories/bukety.jpg"
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
              <h3 className="sf-h3 mt-5 text-lg">Бутик впечатлений</h3>
              <p className="sf-body mt-2 text-muted">
                Приходите выбрать букет лично или закажите онлайн — поможем попасть в настроение и
                бюджет.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Quick pick banner */}
      <section className="sf-container-wide py-6 md:py-8">
        <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-brand px-6 py-10 text-center text-white md:px-12 md:py-12">
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-24 opacity-30 md:w-40"
            style={{
              backgroundImage:
                'radial-gradient(circle at 30% 40%, transparent 40%, rgb(255 255 255 / 0.15) 41% 42%, transparent 43%), radial-gradient(circle at 70% 60%, transparent 45%, rgb(255 255 255 / 0.12) 46% 47%, transparent 48%)',
            }}
            aria-hidden
          />
          <h2 className="relative text-[clamp(1.35rem,2.5vw,1.85rem)] font-semibold">
            Красивый букет — лучший подарок!
          </h2>
          <p className="relative mt-2 text-sm text-white/80">
            Быстрый подбор — мы подберём вам идеальный вариант
          </p>
          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link href="/bukety" className="rounded-full bg-white px-4 py-2.5 text-sm text-muted">
              Цветок ▾
            </Link>
            <Link href="/bukety" className="rounded-full bg-white px-4 py-2.5 text-sm text-muted">
              Повод / Кому ▾
            </Link>
            <Link href="/bukety" className="rounded-full bg-white px-4 py-2.5 text-sm text-muted">
              Бюджет ▾
            </Link>
            <Link href="/bukety" className="sf-cta-beige">
              Подобрать
            </Link>
          </div>
        </div>
      </section>

      {sections.map((section) => {
        switch (section.kind) {
          case 'featured':
            return null;

          case 'discovery':
            return (
              <section key={section.id} className="sf-container-wide py-12 md:py-14">
                <Reveal>
                  <div className="sf-section-title">
                    <p className="sf-label">Быстрый подбор</p>
                    <h2 className="sf-h2">{section.heading}</h2>
                  </div>
                </Reveal>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {PRICE_BANDS.map((band) => (
                    <li key={band.id}>
                      <Link
                        href={`/bukety?band=${band.id}`}
                        className="sf-tile flex min-h-[4.75rem] flex-col justify-between p-4"
                      >
                        <span className="sf-label text-[0.65rem]">Бюджет</span>
                        <span className="text-lg font-semibold">{band.label}</span>
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

          case 'occasions':
            return (
              <section key={section.id} className="sf-band-surface py-12 md:py-14">
                <div className="sf-container-wide">
                  <div className="sf-section-title">
                    <p className="sf-label">Поводы</p>
                    <h2 className="sf-h2">{section.heading}</h2>
                  </div>
                  <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {occasions.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/povod/${item.slug}`}
                          className="sf-tile flex min-h-24 items-center justify-between gap-4 px-5 py-5"
                        >
                          <span className="text-lg font-semibold">{item.name}</span>
                          <span aria-hidden>→</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );

          case 'recipients':
            return (
              <section key={section.id} className="sf-container-wide py-12 md:py-14">
                <div className="sf-section-title">
                  <p className="sf-label">Кому</p>
                  <h2 className="sf-h2">{section.heading}</h2>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {recipients.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/komu/${item.slug}`}
                        className="sf-tile block px-5 py-8 text-center text-lg font-semibold"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
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
              <section key={section.id} className="sf-container-wide py-10 md:py-12">
                <div className="sf-panel-ink px-7 py-10 text-center md:px-12 md:py-12">
                  <p className="sf-label mb-2 text-white/55">Нужна подсказка?</p>
                  <h2 className="sf-h2 text-white">{section.heading}</h2>
                  <p className="sf-body mx-auto mt-3 max-w-xl text-white/75">
                    Подскажем по цене, поводу и настроению — в каталоге или по телефону.
                  </p>
                  <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Link href="/bukety" className="sf-cta bg-white text-ink hover:bg-white/90">
                      Помочь выбрать
                    </Link>
                    {settings.phone ? (
                      <a
                        href={`tel:${settings.phone.replace(/\s+/g, '')}`}
                        className="text-lg font-semibold text-white underline-offset-4 hover:underline"
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
              <section key={section.id} className="sf-container-wide py-12 md:py-14">
                <div className="grid gap-4 md:grid-cols-2 md:gap-6">
                  <div className="sf-panel flex h-full flex-col justify-center p-7 md:p-9">
                    <p className="sf-label mb-2">Как получаете</p>
                    <h2 className="sf-h2">{section.heading}</h2>
                    <p className="sf-body mt-4 max-w-md text-muted">
                      {settings.deliverySummary ??
                        'Доставляем букеты по Гродно. После оформления менеджер свяжется для подтверждения.'}
                    </p>
                    <Link href="/dostavka" className="sf-cta mt-7 w-fit">
                      Подробнее о доставке
                    </Link>
                  </div>
                  <div className="sf-panel-ink flex h-full flex-col justify-center p-7 md:p-9">
                    <p className="text-xl font-bold text-white md:text-2xl">Свежие цветы каждый день</p>
                    <p className="sf-body mt-3 text-white/75">
                      Собираем букеты в день доставки. Замены согласуем заранее.
                    </p>
                    <ul className="mt-6 space-y-2 text-sm text-white/85">
                      <li>• Сборка в день заказа</li>
                      <li>• Доставка по {settings.city}</li>
                      <li>• Самовывоз из студии</li>
                    </ul>
                  </div>
                </div>
              </section>
            );

          default:
            return null;
        }
      })}

      {/* SEO blurb */}
      <section className="sf-container-wide border-t border-border py-12 md:py-14">
        <h2 className="sf-h2">Доставка цветов по {settings.city}</h2>
        <div className="sf-body mt-4 max-w-3xl space-y-3 text-muted">
          <p>
            {brandName} — интернет-магазин букетов с доставкой по {settings.city}. Выбирайте готовые
            композиции в каталоге или позвоните — поможем подобрать букет к поводу и бюджету.
          </p>
          <p>
            Собираем цветы в день заказа, аккуратно упаковываем и доставляем курьером. Также доступен
            самовывоз из студии.
          </p>
        </div>
      </section>
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
      <section className="sf-band-surface py-12 md:py-14">
        <div className="sf-container-wide">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="sf-label mb-1">Коллекция</p>
              <h2 className="sf-h2">{heading || collection.name}</h2>
            </div>
            <div className="flex items-center gap-4">
              <p className="sf-small text-muted">{city}</p>
              <Link href={`/collections/${collection.slug}`} className="text-sm font-medium underline-offset-4 hover:underline">
                Смотреть все
              </Link>
            </div>
          </div>
          <ProductGrid products={collection.products.slice(0, 8)} />
        </div>
      </section>
    );
  } catch {
    return null;
  }
}

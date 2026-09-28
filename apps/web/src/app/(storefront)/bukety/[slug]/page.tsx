import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { FavoriteButton } from '@/components/storefront/favorite-button';
import { ProductDetailTabs } from '@/components/storefront/product-detail-tabs';
import { ProductGallery } from '@/components/storefront/product-gallery';
import { ProductGrid } from '@/components/storefront/product-grid';
import { ProductPurchasePanel } from '@/components/storefront/product-purchase-panel';
import { SectionRail } from '@/components/storefront/section-rail';
import {
  getFulfillmentOptions,
  getLegalSeller,
  getProductBySlug,
  getStorefrontSettings,
  listRelatedProducts,
  PublicApiError,
} from '@/lib/public-api';
import { serializeJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { buildBreadcrumbJsonLd, buildProductJsonLd } from '@/lib/seo/product-json-ld';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const resolved = await getProductBySlug(slug);
    const product = resolved.product;
    const image = product.media.find((m) => m.isPrimary)?.url ?? product.media[0]?.url;
    return buildPageMetadata({
      title: product.seo.resolvedTitle,
      description: product.seo.resolvedDescription,
      path: `/bukety/${resolved.canonicalSlug}`,
      imageUrl: image,
      noIndex: product.seo.noIndex,
    });
  } catch {
    return buildPageMetadata({
      title: 'Букет',
      description: 'Страница букета',
      path: `/bukety/${slug}`,
      noIndex: true,
    });
  }
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;

  let resolved;
  try {
    resolved = await getProductBySlug(slug);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  if (resolved.redirectedFrom) {
    permanentRedirect(`/bukety/${resolved.canonicalSlug}`);
  }

  const product = resolved.product;
  const [related, settings, fulfillment, seller] = await Promise.all([
    listRelatedProducts(product.slug, 8).catch(() => []),
    getStorefrontSettings().catch(() => null),
    getFulfillmentOptions().catch(() => null),
    getLegalSeller().catch(() => null),
  ]);

  const productLd = buildProductJsonLd(product);
  const breadcrumbLd = buildBreadcrumbJsonLd([
    { name: 'Главная', path: '/' },
    { name: 'Каталог', path: '/bukety' },
    { name: product.name, path: `/bukety/${product.slug}` },
  ]);

  const phone = settings?.phone ?? null;
  const city = settings?.city ?? null;
  const substitutionNote = settings?.substitutionNote ?? null;
  const deliverySummary = settings?.deliverySummary ?? null;
  const offlinePaymentDescription = seller?.actualOfflinePaymentDescription ?? null;

  return (
    <main id="main-content" className="sf-pdp">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbLd) }}
      />

      <div className="sf-container-wide sf-pdp__inner">
        <Breadcrumbs
          className="mb-4 text-center"
          items={[
            { name: 'Главная', href: '/' },
            { name: 'Букеты', href: '/bukety' },
            { name: product.name },
          ]}
        />

        <article className="sf-pdp-shell">
          <header className="sf-pdp-shell__head">
            <h1 className="sf-h1">{product.name}</h1>
            <div className="sf-pdp-shell__fav">
              <FavoriteButton productId={product.id} slug={product.slug} />
            </div>
          </header>

          <div className="sf-pdp-layout">
            <div className="sf-pdp-layout__media">
              <ProductGallery
                media={product.media}
                productName={product.name}
                heightCm={product.heightCm}
                bouquetSizeName={product.bouquetSize?.name ?? null}
                promotionPercent={product.promotion?.percentOff ?? null}
              />
            </div>

            <div className="sf-pdp-layout__buy pb-24 lg:pb-0">
              <ProductPurchasePanel
                product={product}
                variants={product.variants}
                phone={phone}
                city={city}
                fulfillment={fulfillment}
                deliverySummary={deliverySummary}
              />

              <ProductDetailTabs
                product={product}
                fulfillment={fulfillment}
                deliverySummary={deliverySummary}
                substitutionNote={substitutionNote}
                city={city}
                offlinePaymentDescription={offlinePaymentDescription}
              />
            </div>
          </div>
        </article>

        <section className="sf-pdp-perks-bar" aria-label="Преимущества">
          <ul className="sf-pdp-perks">
            <li>
              <TruckIcon />
              <span>
                <strong>Доставка</strong>
                <em>курьером по городу</em>
              </span>
            </li>
            <li>
              <GiftIcon />
              <span>
                <strong>Подарок</strong>
                <em>открытка по запросу</em>
              </span>
            </li>
            <li>
              <StoreIcon />
              <span>
                <strong>Магазин</strong>
                <em>{city ? `в ${city}` : 'самовывоз'}</em>
              </span>
            </li>
            <li>
              <CameraIcon />
              <span>
                <strong>Фото</strong>
                <em>до отправки по запросу</em>
              </span>
            </li>
          </ul>
        </section>

        {related.length > 0 ? (
          <section className="sf-pdp-related">
            <SectionRail title="Похожие букеты" href="/bukety" linkLabel="Смотреть все" />
            <ProductGrid products={related} priorityCount={0} />
          </section>
        ) : null}
      </div>
    </main>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sf-pdp-perks__icon" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7V10Z" strokeLinejoin="round" />
      <circle cx="7" cy="17" r="1.5" />
      <circle cx="17" cy="17" r="1.5" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sf-pdp-perks__icon" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 11h16v9H4zM4 11V8h16v3M12 8v12M12 8c-2 0-3.5-1.5-3.5-3S10 3 12 5c2-2 3.5-.5 3.5 1S14 8 12 8Z" strokeLinejoin="round" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sf-pdp-perks__icon" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 10 6 5h12l2 5v9H4v-9Z" strokeLinejoin="round" />
      <path d="M9 19v-5h6v5" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sf-pdp-perks__icon" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 8h3l2-2h6l2 2h3v11H4V8Z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

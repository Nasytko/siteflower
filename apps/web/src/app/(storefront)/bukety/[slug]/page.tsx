import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { HomeSectionHead } from '@/components/storefront/home-section-head';
import { ProductDetailInfo } from '@/components/storefront/product-detail-info';
import { ProductGallery } from '@/components/storefront/product-gallery';
import { ProductFamilySwitcher } from '@/components/storefront/product-family-switcher';
import { ProductPerks } from '@/components/storefront/product-perks';
import {
  ProductBuyCard,
  ProductPostcardCard,
  ProductPurchaseProvider,
  ProductStickyBar,
  type PostcardOption,
} from '@/components/storefront/product-purchase-panel';
import { ProductRow } from '@/components/storefront/product-row';
import {
  EMPTY_PRODUCT_PAGE,
  getFulfillmentOptions,
  getLegalSeller,
  getProductBySlug,
  getStorefrontSettings,
  listProducts,
  listRelatedProducts,
  PublicApiError,
} from '@/lib/public-api';
import { serializeJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { buildBreadcrumbJsonLd, buildProductJsonLd } from '@/lib/seo/product-json-ld';
import { pickDerivativeUrl, sortProductMedia } from '@/lib/media';
import { categoryNavHref } from '@/lib/storefront-nav';

type Params = Promise<{ slug: string }>;

/** Catalog category whose products are offered as postcard designs on the product page. */
const POSTCARD_CATEGORY_SLUG = 'otkrytki';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const resolved = await getProductBySlug(slug);
    const product = resolved.product;
    const primary = sortProductMedia(product.media)[0];
    const image = primary ? pickDerivativeUrl(primary, 1200) ?? primary.url : undefined;
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
  const [related, settings, fulfillment, seller, postcardPage] = await Promise.all([
    listRelatedProducts(product.slug, 8).catch(() => []),
    getStorefrontSettings().catch(() => null),
    getFulfillmentOptions().catch(() => null),
    getLegalSeller().catch(() => null),
    listProducts({ categorySlug: POSTCARD_CATEGORY_SLUG, pageSize: 12 }).catch(
      () => EMPTY_PRODUCT_PAGE,
    ),
  ]);

  const postcards: PostcardOption[] = postcardPage.items
    .filter((item) => item.availability !== 'TEMPORARILY_UNAVAILABLE' && item.defaultVariant)
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      primaryImageUrl: item.primaryImageUrl,
      defaultVariant: item.defaultVariant,
      availability: item.availability,
      price: item.price,
    }));

  const productLd = buildProductJsonLd(product);
  const catalogCrumb = product.catalogCategory
    ? {
        name: product.catalogCategory.name,
        path: categoryNavHref(product.catalogCategory.slug),
      }
    : { name: 'Букеты', path: '/bukety' };

  const breadcrumbItems = [
    { name: 'Главная', href: '/' },
    { name: catalogCrumb.name, href: catalogCrumb.path },
    { name: product.name },
  ];

  const breadcrumbLd = buildBreadcrumbJsonLd([
    { name: 'Главная', path: '/' },
    { name: catalogCrumb.name, path: catalogCrumb.path },
    { name: product.name, path: `/bukety/${product.slug}` },
  ]);

  const city = settings?.city ?? null;
  const outOfCityDeliveryNote = settings?.outOfCityDeliveryNote ?? null;
  const purchaseProduct = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    currency: product.currency,
    availability: product.availability,
    price: product.price,
    promotion: product.promotion,
    media: product.media,
    variants: product.variants,
    shortDescription: product.shortDescription,
    badgeLabel: product.badgeLabel ?? null,
  };

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

      <div className="sf-container-wide">
        <Breadcrumbs className="sf-pdp-crumbs" items={breadcrumbItems} />

        <ProductPurchaseProvider product={purchaseProduct} postcards={postcards}>
          <article className="sf-pdp-top">
            <div className="sf-pdp-top__gallery">
              <ProductGallery
                media={product.media}
                productId={product.id}
                productSlug={product.slug}
                productName={product.name}
                heightCm={product.heightCm}
                promotionPercent={product.promotion?.percentOff ?? null}
              />
            </div>

            <div className="sf-pdp-top__buy">
              <ProductBuyCard
                whatsappUrl={settings?.whatsappUrl ?? null}
                telegramUrl={settings?.telegramUrl ?? null}
                phone={settings?.phone ?? null}
              >
                {product.family ? (
                  <ProductFamilySwitcher family={product.family} currentSlug={product.slug} />
                ) : null}
              </ProductBuyCard>
            </div>

            <div className="sf-pdp-top__perks">
              <ProductPerks
                fulfillment={fulfillment}
                city={city}
                pickupAddress={seller?.pickupAddress ?? settings?.address ?? null}
                workingHours={settings?.workingHours ?? null}
                outOfCityDeliveryNote={outOfCityDeliveryNote}
                photoReportNote={settings?.photoReportNote ?? null}
              />
            </div>

            <div className="sf-pdp-top__card">
              <ProductPostcardCard />
            </div>
          </article>

          <ProductDetailInfo
            product={product}
            fulfillment={fulfillment}
            deliverySummary={settings?.deliverySummary ?? null}
            substitutionNote={settings?.substitutionNote ?? null}
            outOfCityDeliveryNote={outOfCityDeliveryNote}
            paymentDescription={seller?.actualOfflinePaymentDescription ?? null}
            packagingNote={settings?.packagingNote ?? null}
            packagingImageUrl={settings?.packagingImageUrl ?? null}
            city={city}
          />

          <ProductStickyBar />
        </ProductPurchaseProvider>

        {related.length > 0 ? (
          <section className="sf-pdp-related" aria-label="Похожие букеты">
            <HomeSectionHead title="Похожие букеты" href={catalogCrumb.path} />
            <ProductRow products={related.slice(0, 5)} priorityCount={0} tone="shelf" />
          </section>
        ) : null}
      </div>
    </main>
  );
}

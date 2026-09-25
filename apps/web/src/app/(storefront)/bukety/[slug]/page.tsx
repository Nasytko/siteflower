import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import type { ComponentUnit } from '@bouquet-one/contracts';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { FavoriteButton } from '@/components/storefront/favorite-button';
import { ProductGallery } from '@/components/storefront/product-gallery';
import { ProductGrid } from '@/components/storefront/product-grid';
import { ProductPurchasePanel } from '@/components/storefront/product-purchase-panel';
import {
  getProductBySlug,
  getStorefrontSettings,
  listRelatedProducts,
  PublicApiError,
} from '@/lib/public-api';
import { serializeJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { buildBreadcrumbJsonLd, buildProductJsonLd } from '@/lib/seo/product-json-ld';

type Params = Promise<{ slug: string }>;

function unitLabel(unit: ComponentUnit): string {
  switch (unit) {
    case 'PIECE':
    case 'STEM':
      return 'шт.';
    case 'BUNCH':
      return 'пуч.';
    default:
      return '';
  }
}

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
  const [related, settings] = await Promise.all([
    listRelatedProducts(product.slug, 8).catch(() => []),
    getStorefrontSettings().catch(() => null),
  ]);

  const productLd = buildProductJsonLd(product);
  const breadcrumbLd = buildBreadcrumbJsonLd([
    { name: 'Главная', path: '/' },
    { name: 'Каталог', path: '/bukety' },
    { name: product.name, path: `/bukety/${product.slug}` },
  ]);

  const phone = settings?.phone ?? null;
  const substitutionNote = settings?.substitutionNote ?? null;

  return (
    <main id="main-content" className="sf-container py-6 sm:py-8 md:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbLd) }}
      />

      <Breadcrumbs
        className="mb-6"
        items={[
          { name: 'Главная', href: '/' },
          { name: 'Каталог', href: '/bukety' },
          { name: product.name },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        <ProductGallery
          media={product.media}
          productName={product.name}
          heightCm={product.heightCm}
        />

        <div className="relative">
          <div className="absolute right-0 top-0">
            <FavoriteButton productId={product.id} slug={product.slug} />
          </div>

          <h1 className="sf-h1 pr-12">{product.name}</h1>

          {product.shortDescription ? (
            <p className="sf-body mt-3 text-muted">{product.shortDescription}</p>
          ) : null}

          <ul className="mt-5 flex flex-wrap gap-2">
            <li className="rounded-[var(--radius-sm)] bg-surface px-2.5 py-1.5 text-sm text-foreground ring-1 ring-border">
              Сборка в день заказа
            </li>
            <li className="rounded-[var(--radius-sm)] bg-surface px-2.5 py-1.5 text-sm text-foreground ring-1 ring-border">
              Доставка или самовывоз
            </li>
            {product.heightCm != null ? (
              <li className="rounded-[var(--radius-sm)] bg-surface px-2.5 py-1.5 text-sm font-semibold text-foreground ring-1 ring-border">
                Высота ≈ {product.heightCm} см
              </li>
            ) : (
              <li className="rounded-[var(--radius-sm)] bg-surface px-2.5 py-1.5 text-sm text-foreground ring-1 ring-border">
                Несколько размеров
              </li>
            )}
          </ul>

          <div className="mt-6 pb-24 lg:pb-0">
            <ProductPurchasePanel
              product={product}
              variants={product.variants}
              phone={phone}
            />
          </div>

          {product.availability === 'TEMPORARILY_UNAVAILABLE' ? (
            <p className="sf-small mt-4 text-muted">Временно недоступен</p>
          ) : product.availability === 'PREORDER' ? (
            <p className="sf-small mt-4 text-muted">Под заказ</p>
          ) : product.availability === 'SEASONAL' ? (
            <p className="sf-small mt-4 text-muted">Сезонный букет</p>
          ) : null}

          {product.components.length > 0 ? (
            <div className="mt-10">
              <h2 className="sf-h3">Состав</h2>
              <ul className="mt-3 space-y-2">
                {product.components.map((item, index) => {
                  const qty =
                    item.quantity != null
                      ? `${item.quantity}${unitLabel(item.unit) ? ` ${unitLabel(item.unit)}` : ''}`
                      : null;
                  return (
                    <li key={`${item.displayName}-${index}`} className="sf-small flex justify-between gap-4 text-foreground">
                      <span>{item.displayName}</span>
                      {qty ? <span className="text-muted tabular-nums">{qty}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {substitutionNote ? (
            <p className="sf-small mt-8 max-w-md text-muted">{substitutionNote}</p>
          ) : null}

          {product.description ? (
            <div className="mt-10">
              <h2 className="sf-h3">Описание</h2>
              <p className="sf-body mt-3 whitespace-pre-line text-muted">{product.description}</p>
            </div>
          ) : null}
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mt-20">
          <h2 className="sf-h2">Похожие букеты</h2>
          <div className="mt-8">
            <ProductGrid products={related} priorityCount={0} />
          </div>
          <div className="mt-8">
            <Link href="/bukety" className="text-sm font-medium text-brand hover:underline">
              Весь каталог
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}

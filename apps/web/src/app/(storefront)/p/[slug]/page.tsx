import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { ProductGrid } from '@/components/storefront/product-grid';
import { bouquetCountLabel } from '@/lib/catalog-search-params';
import {
  EMPTY_PRODUCT_PAGE,
  getSeoLanding,
  listSeoLandingProducts,
  PublicApiError,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pageNumber(raw: Record<string, string | string[] | undefined>): number {
  const value = raw.page;
  const text = Array.isArray(value) ? value[0] : value;
  const parsed = Number(text ?? '1');
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const landing = await getSeoLanding(slug);
    const title = landing.seoTitle?.trim() || landing.title;
    const description =
      landing.seoDescription?.trim() ||
      `${landing.h1} — доставка цветов по Гродно.`;
    return buildPageMetadata({
      title,
      description,
      path: `/p/${landing.canonicalSlug ?? landing.slug}`,
      noIndex: landing.noIndex,
    });
  } catch {
    return buildPageMetadata({
      title: 'Подборка',
      description: 'SEO-подборка букетов',
      path: `/p/${slug}`,
      noIndex: true,
    });
  }
}

export default async function SeoLandingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const raw = await searchParams;
  const page = pageNumber(raw);

  let landing;
  try {
    landing = await getSeoLanding(slug);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  if (landing.redirectedFrom && landing.canonicalSlug) {
    permanentRedirect(`/p/${landing.canonicalSlug}`);
  }

  const products = await listSeoLandingProducts(landing.slug, {
    page,
    pageSize: 24,
  }).catch(() => EMPTY_PRODUCT_PAGE);

  const totalPages =
    products.pageSize > 0 ? Math.max(1, Math.ceil(products.total / products.pageSize)) : 1;

  return (
    <main id="main-content" className="sf-container-wide py-5 sm:py-7">
      <Breadcrumbs
        className="mb-3"
        items={[
          { name: 'Главная', href: '/' },
          { name: landing.h1 },
        ]}
      />

      <header className="mb-6">
        <h1 className="sf-h1">{landing.h1}</h1>
        {landing.body ? (
          <div className="sf-body mt-3 max-w-2xl whitespace-pre-line text-muted">{landing.body}</div>
        ) : landing.seoDescription ? (
          <p className="sf-body mt-1.5 max-w-xl text-muted">{landing.seoDescription}</p>
        ) : null}
        {products.total > 0 ? (
          <p className="sf-small mt-3 text-muted">Найдено {bouquetCountLabel(products.total)}</p>
        ) : null}
      </header>

      {products.items.length === 0 ? (
        <p className="sf-body text-muted">В этой подборке пока нет товаров.</p>
      ) : (
        <ProductGrid products={products.items} />
      )}

      {totalPages > 1 ? (
        <nav className="mt-12 flex items-center justify-center gap-5" aria-label="Страницы подборки">
          {page > 1 ? (
            <Link
              href={`/p/${landing.slug}?page=${page - 1}`}
              className="sf-cta-ghost"
              rel="prev"
            >
              Назад
            </Link>
          ) : null}
          <span className="sf-small text-muted">
            Страница {page} из {totalPages} · {bouquetCountLabel(products.total)}
          </span>
          {page < totalPages ? (
            <Link
              href={`/p/${landing.slug}?page=${page + 1}`}
              className="sf-cta-ghost"
              rel="next"
            >
              Далее
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { TaxonomyLandingKind } from '@bouquet-one/contracts';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { ProductGrid } from '@/components/storefront/product-grid';
import { bouquetCountLabel } from '@/lib/catalog-search-params';
import {
  EMPTY_PRODUCT_PAGE,
  getTaxonomy,
  listProducts,
  PublicApiError,
  type CatalogListParams,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

const KIND_META: Record<
  TaxonomyLandingKind,
  { pathPrefix: string; filterKey: keyof CatalogListParams; hubLabel: string; hubHref: string }
> = {
  flower: { pathPrefix: '/cvety', filterKey: 'flower', hubLabel: 'Цветы', hubHref: '/cvety' },
  occasion: { pathPrefix: '/povod', filterKey: 'occasion', hubLabel: 'Повод', hubHref: '/povod' },
  recipient: { pathPrefix: '/komu', filterKey: 'recipient', hubLabel: 'Кому', hubHref: '/bukety' },
  color: { pathPrefix: '/bukety', filterKey: 'color', hubLabel: 'Цвет', hubHref: '/bukety' },
};

export async function generateTaxonomyMetadata(
  kind: TaxonomyLandingKind,
  slug: string,
): Promise<Metadata> {
  const meta = KIND_META[kind];
  try {
    const taxonomy = await getTaxonomy(kind, slug);
    return buildPageMetadata({
      title: taxonomy.seo.resolvedTitle,
      description: taxonomy.seo.resolvedDescription,
      path: `${meta.pathPrefix}/${taxonomy.slug}`,
      noIndex: taxonomy.seo.noIndex,
    });
  } catch {
    return buildPageMetadata({
      title: meta.hubLabel,
      description: 'Подборка букетов',
      path: `${meta.pathPrefix}/${slug}`,
      noIndex: true,
    });
  }
}

export async function TaxonomyLandingPage({
  kind,
  slug,
}: {
  kind: TaxonomyLandingKind;
  slug: string;
}) {
  const meta = KIND_META[kind];

  let taxonomy;
  try {
    taxonomy = await getTaxonomy(kind, slug);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const products = await listProducts({
    [meta.filterKey]: taxonomy.slug,
    pageSize: 24,
    sort: 'recommended',
  }).catch(() => EMPTY_PRODUCT_PAGE);

  /** Deep-link into the catalog with this dimension preselected. */
  const catalogHref = `/bukety?${meta.filterKey}=${encodeURIComponent(taxonomy.slug)}`;

  return (
    <main id="main-content" className="sf-container-wide py-5 sm:py-7">
      <Breadcrumbs
        className="mb-3"
        items={[
          { name: 'Главная', href: '/' },
          { name: meta.hubLabel, href: meta.hubHref },
          { name: taxonomy.name },
        ]}
      />

      <header className="mb-6">
        <h1 className="sf-h1">{taxonomy.name}</h1>
        {taxonomy.description ? (
          <p className="sf-body mt-1.5 max-w-xl text-muted">{taxonomy.description}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {products.total > 0 ? (
            <p className="sf-small text-muted">Найдено {bouquetCountLabel(products.total)}</p>
          ) : null}
          <Link
            href={catalogHref}
            className="sf-small text-brand underline-offset-2 hover:underline"
          >
            Уточнить фильтрами
          </Link>
        </div>
      </header>

      {products.items.length === 0 ? (
        <div className="sf-panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="sf-h2">Пока здесь нет букетов</p>
          <p className="sf-body max-w-md text-muted">
            Витрина обновляется каждый день — загляните в полный каталог.
          </p>
          <Link href="/bukety" className="sf-cta mt-2">
            Все букеты
          </Link>
        </div>
      ) : (
        <ProductGrid products={products.items} />
      )}
    </main>
  );
}

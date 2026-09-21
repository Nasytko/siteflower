import Link from 'next/link';
import type { Metadata } from 'next';
import {
  CatalogFilters,
  CatalogSortSelect,
  type CatalogFilterOptions,
} from '@/components/storefront/catalog-filters';
import { EmptyState } from '@/components/storefront/empty-state';
import { ProductGrid } from '@/components/storefront/product-grid';
import {
  catalogHasActiveFilters,
  catalogStateToListParams,
  catalogStateToQuery,
  parseCatalogSearchParams,
} from '@/lib/catalog-search-params';
import {
  listCategories,
  listColors,
  listFlowers,
  listOccasions,
  listProducts,
  listRecipients,
  listStyles,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Filtered catalog URLs (?flower=, ?band=, etc.) set noIndex to avoid index bloat.
 * Canonical always points to /bukety so Google consolidates signals on the clean catalog URL.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const raw = await searchParams;
  const state = parseCatalogSearchParams(raw);
  const filtered = catalogHasActiveFilters(state);

  return buildPageMetadata({
    title: filtered ? 'Каталог букетов — подборка' : 'Каталог букетов',
    description: 'Букеты с доставкой по Гродно. Фильтры по цветам, поводу, цене и получателю.',
    path: '/bukety',
    noIndex: filtered,
  });
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const state = parseCatalogSearchParams(raw);
  const listParams = catalogStateToListParams(state);

  const emptyList = { items: [] as Awaited<ReturnType<typeof listProducts>>['items'], total: 0, page: 1, pageSize: 24 };
  const [products, flowers, colors, styles, categories, occasions, recipients] = await Promise.all([
    listProducts(listParams).catch(() => emptyList),
    listFlowers().catch(() => []),
    listColors().catch(() => []),
    listStyles().catch(() => []),
    listCategories().catch(() => []),
    listOccasions().catch(() => []),
    listRecipients().catch(() => []),
  ]);

  const options: CatalogFilterOptions = {
    flowers,
    colors,
    styles,
    categories,
    occasions,
    recipients,
  };

  const totalPages = Math.max(1, Math.ceil(products.total / products.pageSize));
  const countLabel =
    products.total === 0
      ? 'Ничего не найдено'
      : products.total === 1
        ? '1 букет'
        : `${products.total} букетов`;

  return (
    <main id="main-content" className="sf-container-wide py-10 md:py-16">
      <header className="mb-10 max-w-2xl">
        <p className="sf-label mb-2">Каталог</p>
        <h1 className="sf-h1">Букеты</h1>
        <p className="sf-body mt-3 text-muted">
          Выберите букет по цвету, поводу или бюджету — мы доставим по Гродно.
        </p>
      </header>

      <div className="flex gap-10">
        <CatalogFilters state={state} options={options} variant="sidebar" />

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <CatalogFilters state={state} options={options} variant="drawer" />
              <p className="sf-small text-muted" aria-live="polite">
                {countLabel}
              </p>
            </div>
            <CatalogSortSelect state={state} />
          </div>

          {products.items.length === 0 ? (
            <EmptyState
              title="Пока пусто"
              description="Попробуйте сбросить фильтры или выбрать другой ценовой диапазон."
              actionHref="/bukety"
              actionLabel="Сбросить фильтры"
            />
          ) : (
            <ProductGrid products={products.items} />
          )}

          {totalPages > 1 ? (
            <nav className="mt-12 flex items-center justify-center gap-4" aria-label="Страницы">
              {state.page > 1 ? (
                <Link
                  href={`/bukety${catalogStateToQuery({ ...state, page: state.page - 1 })}`}
                  className="text-sm font-medium text-brand hover:underline"
                >
                  Назад
                </Link>
              ) : (
                <span className="text-sm text-muted">Назад</span>
              )}
              <span className="sf-small text-muted">
                {state.page} / {totalPages}
              </span>
              {state.page < totalPages ? (
                <Link
                  href={`/bukety${catalogStateToQuery({ ...state, page: state.page + 1 })}`}
                  className="text-sm font-medium text-brand hover:underline"
                >
                  Далее
                </Link>
              ) : (
                <span className="text-sm text-muted">Далее</span>
              )}
            </nav>
          ) : null}
        </div>
      </div>
    </main>
  );
}

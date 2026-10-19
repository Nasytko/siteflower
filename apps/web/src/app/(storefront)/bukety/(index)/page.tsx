import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import {
  CatalogActiveFilters,
  CatalogEmptyState,
  CatalogFilters,
  CatalogPager,
  CatalogToolbar,
  type CatalogFilterOptions,
} from '@/components/storefront/catalog-filters';
import { ProductGrid } from '@/components/storefront/product-grid';
import {
  catalogHasActiveFilters,
  catalogStateToListParams,
  catalogStateToQuery,
  parseCatalogSearchParams,
} from '@/lib/catalog-search-params';
import {
  EMPTY_PRODUCT_PAGE,
  listBudgetRanges,
  listColors,
  listFlowerTypes,
  listOccasions,
  listProducts,
  listRecipients,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Filtered catalog URLs (?flower=, ?budget=, …) set noIndex to avoid index bloat.
 * Canonical always points to /bukety so Google consolidates signals on the clean URL.
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
    description:
      'Букеты с доставкой по Гродно. Подбор по бюджету, поводу, цвету и виду цветка.',
    path: '/bukety',
    noIndex: filtered,
  });
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const state = parseCatalogSearchParams(raw);
  const listParams = catalogStateToListParams(state);

  const [products, budgets, occasions, recipients, colors, flowers] = await Promise.all([
    listProducts(listParams).catch(() => EMPTY_PRODUCT_PAGE),
    listBudgetRanges().catch(() => []),
    listOccasions().catch(() => []),
    listRecipients().catch(() => []),
    listColors().catch(() => []),
    listFlowerTypes().catch(() => []),
  ]);

  const options: CatalogFilterOptions = {
    budgets,
    occasions,
    recipients,
    colors,
    flowers,
  };

  const totalPages =
    products.pageSize > 0 ? Math.max(1, Math.ceil(products.total / products.pageSize)) : 1;
  return (
    <main id="main-content" className="sf-container-wide py-5 sm:py-7">
      <Breadcrumbs className="mb-3" items={[{ name: 'Главная', href: '/' }, { name: 'Букеты' }]} />

      <header className="mb-5">
        <h1 className="sf-h1">Букеты</h1>
        <p className="sf-body mt-1.5 max-w-xl text-muted">
          Свежая сборка и доставка по Гродно. Подберите по бюджету, поводу или цвету.
        </p>
      </header>

      <div className="sf-catalog-layout">
        <aside className="sf-catalog-aside">
          <CatalogFilters state={state} options={options} />
        </aside>

        <div className="sf-catalog-main">
          <CatalogToolbar state={state} total={products.total} />
          <CatalogActiveFilters state={state} options={options} />

          {products.items.length === 0 ? (
            <CatalogEmptyState state={state} />
          ) : (
            <ProductGrid products={products.items} />
          )}

          <CatalogPager
            page={state.page}
            totalPages={totalPages}
            prevHref={
              state.page > 1
                ? `/bukety${catalogStateToQuery({ ...state, page: state.page - 1 })}`
                : null
            }
            nextHref={
              state.page < totalPages
                ? `/bukety${catalogStateToQuery({ ...state, page: state.page + 1 })}`
                : null
            }
          />
        </div>
      </div>
    </main>
  );
}

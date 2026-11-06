import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { TaxonomyLandingKind } from '@bouquet-one/contracts';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { CatalogPager } from '@/components/storefront/catalog-filters';
import {
  KatalogFiltersPanel,
  KatalogToolbar,
} from '@/components/storefront/katalog-filters-panel';
import { ProductGrid } from '@/components/storefront/product-grid';
import {
  applyTaxonomyLock,
  gateKatalogSearchState,
  katalogHasFiltersBeyondLock,
  katalogHasNonDefaultSort,
  katalogStateToListParams,
  parseKatalogSearchParams,
  taxonomyKatalogHref,
  type TaxonomyLock,
} from '@/lib/katalog-search-params';
import {
  EMPTY_PRODUCT_PAGE,
  getTaxonomy,
  listCategoryFilters,
  listProducts,
  PublicApiError,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

const BOUQUETS_SLUG = 'bouquets';

const KIND_META: Record<
  Exclude<TaxonomyLandingKind, 'flower' | 'color'>,
  {
    pathPrefix: '/komu' | '/povod' | '/k-prazdniku';
    hubLabel: string;
    hubHref: string;
    lockKey: TaxonomyLock['kind'];
  }
> = {
  occasion: {
    pathPrefix: '/povod',
    hubLabel: 'Повод',
    hubHref: '/povod',
    lockKey: 'occasion',
  },
  holiday: {
    pathPrefix: '/k-prazdniku',
    hubLabel: 'К празднику',
    hubHref: '/k-prazdniku',
    lockKey: 'occasion',
  },
  recipient: {
    pathPrefix: '/komu',
    hubLabel: 'Кому',
    hubHref: '/catalog/bouquets',
    lockKey: 'recipient',
  },
};

type TaxonomyKind = keyof typeof KIND_META;

function lockFor(kind: TaxonomyKind, slug: string): TaxonomyLock {
  return KIND_META[kind].lockKey === 'recipient'
    ? { kind: 'recipient', slug }
    : { kind: 'occasion', slug };
}

export async function generateTaxonomyMetadata(
  kind: TaxonomyKind,
  slug: string,
  rawSearch: Record<string, string | string[] | undefined> = {},
): Promise<Metadata> {
  const meta = KIND_META[kind];
  const lock = lockFor(kind, slug);
  try {
    const taxonomy = await getTaxonomy(kind, slug);
    const filters = await listCategoryFilters(BOUQUETS_SLUG).catch(() => []);
    const rawState = parseKatalogSearchParams(rawSearch);
    const gated = gateKatalogSearchState(
      rawState,
      filters.map((row) => row.key),
    );
    const state = applyTaxonomyLock(gated, lock);
    const refined =
      katalogHasFiltersBeyondLock(state, lock) || katalogHasNonDefaultSort(state);
    const path =
      refined
        ? `${meta.pathPrefix}/${taxonomy.slug}`
        : state.page > 1
          ? `${meta.pathPrefix}/${taxonomy.slug}?page=${state.page}`
          : `${meta.pathPrefix}/${taxonomy.slug}`;

    return buildPageMetadata({
      title: refined
        ? `${taxonomy.seo.resolvedTitle} — подборка`
        : taxonomy.seo.resolvedTitle,
      description: taxonomy.seo.resolvedDescription,
      path,
      noIndex: refined || taxonomy.seo.noIndex,
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
  searchParams = {},
}: {
  kind: TaxonomyKind;
  slug: string;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const meta = KIND_META[kind];
  const lock = lockFor(kind, slug);

  let taxonomy;
  try {
    taxonomy = await getTaxonomy(kind, slug);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const filters = await listCategoryFilters(BOUQUETS_SLUG).catch(() => []);
  const rawState = parseKatalogSearchParams(searchParams);
  const gated = gateKatalogSearchState(
    rawState,
    filters.map((row) => row.key),
  );
  const state = applyTaxonomyLock(gated, lock);
  const listParams = katalogStateToListParams(BOUQUETS_SLUG, state);
  const products = await listProducts(listParams).catch(() => EMPTY_PRODUCT_PAGE);
  const totalPages =
    products.pageSize > 0 ? Math.max(1, Math.ceil(products.total / products.pageSize)) : 1;

  const buildHref = (
    current: typeof state,
    patch: Partial<typeof state> = {},
  ) => taxonomyKatalogHref(meta.pathPrefix, taxonomy.slug, lock, current, patch);

  const clearHref = `${meta.pathPrefix}/${encodeURIComponent(taxonomy.slug)}`;
  const hiddenFilterKeys = [lock.kind] as const;
  const hasFilters = filters.length > 0;

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

      <header className="mb-5">
        <h1 className="sf-h1">{taxonomy.name}</h1>
        {taxonomy.description ? (
          <p className="sf-body mt-1.5 max-w-xl text-muted">{taxonomy.description}</p>
        ) : null}
      </header>

      <div className={hasFilters ? 'sf-catalog-layout' : undefined}>
        {hasFilters ? (
          <aside className="sf-catalog-aside">
            <KatalogFiltersPanel
              categorySlug={BOUQUETS_SLUG}
              state={state}
              total={products.total}
              filters={filters}
              listingKind="BOUQUETS"
              hideToolbar
              buildHref={buildHref}
              clearHref={clearHref}
              hiddenFilterKeys={hiddenFilterKeys}
              ignoreActiveKeys={hiddenFilterKeys}
            />
          </aside>
        ) : null}

        <div className="sf-catalog-main">
          <KatalogToolbar
            categorySlug={BOUQUETS_SLUG}
            state={state}
            total={products.total}
            listingKind="BOUQUETS"
            buildHref={buildHref}
          />

          {products.items.length === 0 ? (
            <div className="sf-panel flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="sf-h2">Пока здесь нет букетов</p>
              <p className="sf-body max-w-md text-muted">
                Витрина обновляется каждый день — загляните в полный каталог или сбросьте фильтры.
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                {katalogHasFiltersBeyondLock(state, lock) ? (
                  <Link href={clearHref} className="sf-cta">
                    Сбросить фильтры
                  </Link>
                ) : null}
                <Link href="/catalog/bouquets" className="sf-cta">
                  Все букеты
                </Link>
              </div>
            </div>
          ) : (
            <ProductGrid products={products.items} />
          )}

          <CatalogPager
            page={state.page}
            totalPages={totalPages}
            prevHref={
              state.page > 1 ? buildHref(state, { page: state.page - 1 }) : null
            }
            nextHref={
              state.page < totalPages ? buildHref(state, { page: state.page + 1 }) : null
            }
          />
        </div>
      </div>
    </main>
  );
}

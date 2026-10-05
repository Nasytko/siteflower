import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { KatalogFiltersPanel } from '@/components/storefront/katalog-filters-panel';
import { ProductGrid } from '@/components/storefront/product-grid';
import {
  bouquetCountLabel,
  gateKatalogSearchState,
  katalogHasActiveFilters,
  katalogHref,
  katalogStateToListParams,
  parseKatalogSearchParams,
} from '@/lib/katalog-search-params';
import {
  EMPTY_PRODUCT_PAGE,
  getCatalogCategory,
  listCatalogCategoryTree,
  listCategoryFilters,
  listProducts,
  PublicApiError,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { categoryNavHref, findCategoryInTree } from '@/lib/storefront-nav';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const raw = await searchParams;
  const rawState = parseKatalogSearchParams(raw);
  const enabledKeys = await listCategoryFilters(slug)
    .then((rows) => rows.map((row) => row.key))
    .catch(() => [] as const);
  const state = gateKatalogSearchState(rawState, enabledKeys);
  const filtered = katalogHasActiveFilters(state);

  try {
    const category = await getCatalogCategory(slug);
    const title = category.seoTitle?.trim() || category.name;
    const description =
      category.seoDescription?.trim() ||
      `${category.name} — доставка цветов по Гродно.`;
    return buildPageMetadata({
      title: filtered ? `${title} — подборка` : title,
      description,
      path: `/katalog/${slug}`,
      noIndex: filtered || category.noIndex,
    });
  } catch {
    return buildPageMetadata({
      title: 'Каталог',
      description: 'Категория каталога',
      path: `/katalog/${slug}`,
      noIndex: true,
    });
  }
}

export default async function KatalogCategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const raw = await searchParams;
  const rawState = parseKatalogSearchParams(raw);

  let category;
  try {
    category = await getCatalogCategory(slug);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  if (category.redirectedFrom && category.canonicalSlug) {
    permanentRedirect(`/katalog/${category.canonicalSlug}`);
  }

  const tree = await listCatalogCategoryTree().catch(() => [] as Awaited<ReturnType<typeof listCatalogCategoryTree>>);
  const located = findCategoryInTree(slug, tree);
  const childCategories = located?.node.children?.filter((c) => c.visibility === 'VISIBLE') ?? [];
  const ancestors = located?.ancestors ?? [];

  const filters = await listCategoryFilters(slug).catch(() => []);
  const state = gateKatalogSearchState(
    rawState,
    filters.map((row) => row.key),
  );
  const listParams = katalogStateToListParams(slug, state);
  const products = await listProducts(listParams).catch(() => EMPTY_PRODUCT_PAGE);

  const totalPages =
    products.pageSize > 0 ? Math.max(1, Math.ceil(products.total / products.pageSize)) : 1;

  const breadcrumbItems: Array<{ name: string; href?: string }> = [{ name: 'Главная', href: '/' }];
  for (const ancestor of ancestors) {
    breadcrumbItems.push({ name: ancestor.name, href: categoryNavHref(ancestor.slug) });
  }
  breadcrumbItems.push({ name: category.name });

  return (
    <main id="main-content" className="sf-container-wide py-5 sm:py-7">
      <Breadcrumbs className="mb-3" items={breadcrumbItems} />

      <header className="mb-5">
        <h1 className="sf-h1">{category.name}</h1>
        {category.seoDescription ? (
          <p className="sf-body mt-1.5 max-w-xl text-muted">{category.seoDescription}</p>
        ) : null}
      </header>

      {childCategories.length > 0 ? (
        <nav className="mb-6 flex flex-wrap gap-2" aria-label="Подкатегории">
          {childCategories.map((child) => (
            <Link key={child.slug} href={categoryNavHref(child.slug)} className="sf-filter-pill text-sm">
              {child.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {filters.length > 0 ? (
        <div className="mb-5">
          <KatalogFiltersPanel
            categorySlug={slug}
            state={state}
            total={products.total}
            filters={filters}
          />
        </div>
      ) : (
        <p className="sf-small mb-5 text-muted">{bouquetCountLabel(products.total)}</p>
      )}

      {products.items.length === 0 ? (
        <p className="sf-body text-muted">По выбранным фильтрам ничего не найдено.</p>
      ) : (
        <ProductGrid products={products.items} />
      )}

      {totalPages > 1 ? (
        <nav className="mt-12 flex items-center justify-center gap-5" aria-label="Страницы каталога">
          {state.page > 1 ? (
            <Link
              href={katalogHref(slug, state, { page: state.page - 1 })}
              className="sf-cta-ghost"
              rel="prev"
            >
              Назад
            </Link>
          ) : null}
          <span className="sf-small text-muted">
            Страница {state.page} из {totalPages} · {bouquetCountLabel(products.total)}
          </span>
          {state.page < totalPages ? (
            <Link
              href={katalogHref(slug, state, { page: state.page + 1 })}
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

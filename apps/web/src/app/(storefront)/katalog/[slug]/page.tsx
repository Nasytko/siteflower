import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { KatalogFlowerFilters } from '@/components/storefront/katalog-flower-filters';
import { ProductGrid } from '@/components/storefront/product-grid';
import {
  bouquetCountLabel,
  katalogHasActiveFilters,
  katalogHref,
  katalogStateToListParams,
  parseKatalogSearchParams,
} from '@/lib/katalog-search-params';
import {
  EMPTY_PRODUCT_PAGE,
  getCatalogCategory,
  listCatalogCategoryTree,
  listColors,
  listFlowerOrigins,
  listFlowerVarieties,
  listProducts,
  PublicApiError,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';
import {
  categoryNavHref,
  categoryUsesFlowerFilters,
  findCategoryInTree,
} from '@/lib/storefront-nav';

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
  const state = parseKatalogSearchParams(raw);
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
  const state = parseKatalogSearchParams(raw);
  const listParams = katalogStateToListParams(slug, state);

  let category;
  try {
    category = await getCatalogCategory(slug);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const tree = await listCatalogCategoryTree().catch(() => [] as Awaited<ReturnType<typeof listCatalogCategoryTree>>);
  const located = findCategoryInTree(slug, tree);
  const childCategories = located?.node.children?.filter((c) => c.visibility === 'VISIBLE') ?? [];
  const ancestors = located?.ancestors ?? [];
  const showFlowerFilters = categoryUsesFlowerFilters(category, ancestors);

  const [products, colors, varieties, origins] = await Promise.all([
    listProducts(listParams).catch(() => EMPTY_PRODUCT_PAGE),
    showFlowerFilters ? listColors().catch(() => []) : Promise.resolve([]),
    showFlowerFilters ? listFlowerVarieties().catch(() => []) : Promise.resolve([]),
    showFlowerFilters ? listFlowerOrigins().catch(() => []) : Promise.resolve([]),
  ]);

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

      {showFlowerFilters ? (
        <div className="mb-5">
          <KatalogFlowerFilters
            categorySlug={slug}
            state={state}
            total={products.total}
            varieties={varieties}
            colors={colors}
            origins={origins}
          />
        </div>
      ) : null}

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

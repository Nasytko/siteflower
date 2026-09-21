import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { TaxonomyLandingKind } from '@bouquet-one/contracts';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { EmptyState } from '@/components/storefront/empty-state';
import { ProductGrid } from '@/components/storefront/product-grid';
import {
  getTaxonomy,
  listProducts,
  PublicApiError,
  type CatalogListParams,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

const KIND_META: Record<
  TaxonomyLandingKind,
  { pathPrefix: string; filterKey: keyof CatalogListParams; catalogLabel: string }
> = {
  flower: { pathPrefix: '/cvety', filterKey: 'flowerSlug', catalogLabel: 'Цветы' },
  occasion: { pathPrefix: '/povod', filterKey: 'occasionSlug', catalogLabel: 'Поводы' },
  recipient: { pathPrefix: '/komu', filterKey: 'recipientSlug', catalogLabel: 'Кому' },
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
      title: meta.catalogLabel,
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
    sort: 'featured',
  });

  return (
    <main id="main-content" className="sf-container py-10 md:py-14">
      <Breadcrumbs
        className="mb-6"
        items={[
          { name: 'Главная', href: '/' },
          { name: 'Каталог', href: '/bukety' },
          { name: taxonomy.name },
        ]}
      />

      <header className="mb-10 max-w-2xl">
        <h1 className="sf-h1">{taxonomy.name}</h1>
        {taxonomy.description ? (
          <p className="sf-body mt-3 text-muted">{taxonomy.description}</p>
        ) : null}
      </header>

      {products.items.length === 0 ? (
        <EmptyState
          title="Букетов пока нет"
          description="Загляните в полный каталог — там всегда есть свежие варианты."
        />
      ) : (
        <ProductGrid products={products.items} />
      )}
    </main>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { EmptyState } from '@/components/storefront/empty-state';
import { ProductGrid } from '@/components/storefront/product-grid';
import { getCollection, PublicApiError } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const collection = await getCollection(slug);
    return buildPageMetadata({
      title: collection.seo.resolvedTitle,
      description: collection.seo.resolvedDescription,
      path: `/collections/${collection.slug}`,
      noIndex: collection.seo.noIndex,
    });
  } catch {
    return buildPageMetadata({
      title: 'Коллекция',
      description: 'Подборка букетов',
      path: `/collections/${slug}`,
      noIndex: true,
    });
  }
}

export default async function CollectionPage({ params }: { params: Params }) {
  const { slug } = await params;

  let collection;
  try {
    collection = await getCollection(slug);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <main id="main-content" className="sf-container py-10 md:py-14">
      <Breadcrumbs
        className="mb-6"
        items={[
          { name: 'Главная', href: '/' },
          { name: 'Каталог', href: '/bukety' },
          { name: collection.name },
        ]}
      />

      <header className="mb-10 max-w-2xl">
        <h1 className="sf-h1">{collection.name}</h1>
        {collection.description ? (
          <p className="sf-body mt-3 text-muted">{collection.description}</p>
        ) : null}
      </header>

      {collection.products.length === 0 ? (
        <EmptyState
          title="В коллекции пока пусто"
          description="Загляните в полный каталог букетов."
        />
      ) : (
        <ProductGrid products={collection.products} />
      )}
    </main>
  );
}

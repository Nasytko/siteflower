import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { ProductGrid } from '@/components/storefront/product-grid';
import { bouquetCountLabel } from '@/lib/catalog-search-params';
import {
  EMPTY_PRODUCT_PAGE,
  getFlowerTypeBySlug,
  listProducts,
  PublicApiError,
} from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export async function generateFlowerTypeMetadata(slug: string): Promise<Metadata> {
  try {
    const flowerType = await getFlowerTypeBySlug(slug);
    if (!flowerType) {
      return buildPageMetadata({
        title: 'Цветы',
        description: 'Подборка букетов',
        path: `/cvety/${slug}`,
        noIndex: true,
      });
    }
    return buildPageMetadata({
      title: flowerType.seoTitle?.trim() || flowerType.name,
      description:
        flowerType.seoDescription?.trim() ||
        `Букеты с ${flowerType.name.toLowerCase()} — доставка по Гродно.`,
      path: `/cvety/${flowerType.slug}`,
      noIndex: flowerType.noIndex === true,
    });
  } catch {
    return buildPageMetadata({
      title: 'Цветы',
      description: 'Подборка букетов',
      path: `/cvety/${slug}`,
      noIndex: true,
    });
  }
}

/** /cvety/[slug] landing powered by FlowerType (not legacy Flower taxonomy). */
export async function FlowerTypeLandingPage({ slug }: { slug: string }) {
  let flowerType;
  try {
    flowerType = await getFlowerTypeBySlug(slug);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
  if (!flowerType) notFound();

  const products = await listProducts({
    flowerTypeSlug: flowerType.slug,
    pageSize: 24,
    sort: 'recommended',
  }).catch(() => EMPTY_PRODUCT_PAGE);

  const catalogHref = `/bukety?flower=${encodeURIComponent(flowerType.slug)}`;

  return (
    <main id="main-content" className="sf-container-wide py-5 sm:py-7">
      <Breadcrumbs
        className="mb-3"
        items={[
          { name: 'Главная', href: '/' },
          { name: 'Цветы', href: '/cvety' },
          { name: flowerType.name },
        ]}
      />

      <header className="mb-6">
        <h1 className="sf-h1">{flowerType.name}</h1>
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

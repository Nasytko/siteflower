import Link from 'next/link';
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { ProductGrid } from '@/components/storefront/product-grid';
import { bouquetCountLabel } from '@/lib/catalog-search-params';
import { EMPTY_PRODUCT_PAGE, listProducts, listPromotionalProducts } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

const PAGE_SIZE = 24;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Акции',
    description:
      'Букеты по акционным ценам с доставкой по Гродно. Скидки действуют, пока предложение активно.',
    path: '/akcii',
  });
}

/**
 * Promotional destination. Discount truth (percent, original and sale price)
 * is server-authoritative — the page only renders what the API returns.
 */
export default async function PromotionsPage() {
  const promoList = await listPromotionalProducts(PAGE_SIZE).catch(() => null);
  const products =
    promoList != null
      ? {
          items: promoList,
          total: promoList.length,
          page: 1,
          pageSize: promoList.length,
        }
      : await listProducts({
          promotion: true,
          pageSize: PAGE_SIZE,
          sort: 'recommended',
        }).catch(() => EMPTY_PRODUCT_PAGE);

  return (
    <main id="main-content" className="sf-container-wide py-5 sm:py-7">
      <Breadcrumbs className="mb-3" items={[{ name: 'Главная', href: '/' }, { name: 'Акции' }]} />

      <header className="mb-6">
        <h1 className="sf-h1">Акции</h1>
        <p className="sf-body mt-1.5 max-w-xl text-muted">
          Букеты со специальной ценой. Предложение действует, пока акция активна.
        </p>
        {products.total > 0 ? (
          <p className="sf-small mt-3 text-muted">Найдено {bouquetCountLabel(products.total)}</p>
        ) : null}
      </header>

      {products.items.length === 0 ? (
        <div className="sf-panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="sf-h2">Сейчас акций нет</p>
          <p className="sf-body max-w-md text-muted">
            Новые предложения появляются регулярно. А пока — весь каталог букетов.
          </p>
          <Link href="/bukety" className="sf-cta mt-2">
            Смотреть букеты
          </Link>
        </div>
      ) : (
        <ProductGrid products={products.items} />
      )}
    </main>
  );
}

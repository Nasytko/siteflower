import type { Metadata } from 'next';
import { CartView } from '@/components/storefront/cart-view';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Корзина',
  description: 'Ваша корзина букетов',
  path: '/cart',
  noIndex: true,
});

export default function CartPage() {
  return (
    <main id="main-content" className="sf-container-wide py-8 sm:py-10 md:py-14">
      <header className="mb-8 max-w-2xl sm:mb-10">
        <p className="sf-label mb-2">Оформление</p>
        <h1 className="sf-h1">Корзина</h1>
        <div className="sf-rule mt-4" />
        <p className="sf-body mt-3 text-muted">Проверьте букеты и переходите к доставке.</p>
      </header>
      <CartView />
    </main>
  );
}

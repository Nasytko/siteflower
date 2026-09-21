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
    <main id="main-content" className="sf-container py-10 md:py-14">
      <h1 className="sf-h1">Корзина</h1>
      <div className="mt-8 max-w-3xl">
        <CartView />
      </div>
    </main>
  );
}

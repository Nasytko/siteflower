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
    <main id="main-content" className="sf-cart-page">
      <div className="sf-container-wide sf-cart-page__inner">
        <header className="sf-cart-page__head">
          <p className="sf-cart-page__eyebrow">Оформление</p>
          <h1 className="sf-cart-page__title">Корзина</h1>
          <p className="sf-cart-page__lead">Проверьте состав и переходите к доставке.</p>
        </header>
        <CartView />
      </div>
    </main>
  );
}

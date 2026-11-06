import type { Metadata } from 'next';
import { CheckoutForm } from '@/components/storefront/checkout-form';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Оформление заказа',
  description: 'Оформление заказа в BUKET №1',
  path: '/checkout',
  noIndex: true,
});

export default function CheckoutPage() {
  return (
    <main id="main-content" className="sf-checkout-page">
      <div className="sf-container sf-checkout-page__inner">
        <header className="sf-checkout-page__head">
          <p className="sf-checkout-page__eyebrow">Почти готово</p>
          <h1 className="sf-checkout-page__title">Оформление заказа</h1>
          <p className="sf-checkout-page__lead">
            Укажите, кому доставить и когда. После отправки менеджер проверит заказ и свяжется с вами.
            Оплата на сайте не производится.
          </p>
        </header>
        <CheckoutForm />
      </div>
    </main>
  );
}

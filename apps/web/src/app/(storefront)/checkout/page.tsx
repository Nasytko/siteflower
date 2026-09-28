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
    <main id="main-content" className="sf-container py-10 md:py-14">
      <h1 className="sf-h1">Оформление заказа</h1>
      <p className="sf-body mt-3 max-w-2xl text-muted">
        Заполните данные — менеджер проверит возможность выполнения и свяжется для подтверждения.
      </p>
      <div className="mt-10">
        <CheckoutForm />
      </div>
    </main>
  );
}

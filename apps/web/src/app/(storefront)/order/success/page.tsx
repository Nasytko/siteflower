import type { Metadata } from 'next';
import { OrderSuccessView } from '@/components/storefront/order-success-view';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Заказ принят',
  description: 'Ваш заказ принят',
  path: '/order/success',
  noIndex: true,
});

export default function OrderSuccessPage() {
  return (
    <main id="main-content" className="sf-container py-14 md:py-20">
      <OrderSuccessView />
    </main>
  );
}

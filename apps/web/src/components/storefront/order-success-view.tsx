'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type LastOrder = {
  orderNumber: string;
  trackingToken: string | null;
  totalMinor?: string;
};

export function OrderSuccessView() {
  const [order, setOrder] = useState<LastOrder | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('bouquet-one:last-order');
      if (raw) {
        setOrder(JSON.parse(raw) as LastOrder);
        sessionStorage.removeItem('bouquet-one:last-order');
      }
    } catch {
      setOrder(null);
    }
  }, []);

  const trackingHref = order?.trackingToken
    ? `/order/${order.trackingToken}`
    : null;

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <p className="sf-label text-brand">Спасибо</p>
      <h1 className="sf-h1">
        {order?.orderNumber
          ? `Спасибо! Заказ №${order.orderNumber} получен`
          : 'Спасибо! Заказ получен'}
      </h1>
      <p className="sf-body text-muted">
        Менеджер проверит возможность выполнения заказа и свяжется с вами для подтверждения деталей.
        Сейчас заказ принят в обработку — это ещё не подтверждение.
      </p>
      <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center">
        {trackingHref ? (
          <Link
            href={trackingHref}
            className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-md)] bg-brand px-6 py-3 text-sm font-medium text-brand-foreground hover:opacity-90"
          >
            Отслеживать заказ
          </Link>
        ) : null}
        <Link
          href="/bukety"
          className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-md)] border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-brand-soft"
        >
          В каталог
        </Link>
      </div>
    </div>
  );
}

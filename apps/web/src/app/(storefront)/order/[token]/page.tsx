import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { OrderTrackingDto } from '@bouquet-one/contracts';
import { formatPriceFromMinor } from '@/lib/media';
import { buildPageMetadata } from '@/lib/seo/metadata';

type Props = { params: Promise<{ token: string }> };

function getApiBase(): string {
  return process.env.API_URL ?? 'http://127.0.0.1:3001';
}

async function fetchTracking(token: string): Promise<OrderTrackingDto | null> {
  if (!token || token.length < 20) return null;
  try {
    const res = await fetch(
      `${getApiBase()}/api/v1/orders/track/${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as OrderTrackingDto;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Статус заказа',
    description: 'Отслеживание заказа',
    path: `/order/${(await params).token}`,
    noIndex: true,
  });
}

export default async function OrderTrackingPage({ params }: Props) {
  const { token } = await params;
  const order = await fetchTracking(token);
  if (!order) notFound();

  return (
    <main id="main-content" className="sf-container py-10 md:py-14">
      <p className="sf-label text-brand">Заказ</p>
      <h1 className="sf-h1 mt-2">№{order.orderNumber}</h1>
      <p className="sf-body mt-3 text-muted">
        Статус: <span className="font-medium text-foreground">{order.statusLabel}</span>
      </p>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="sf-h3">Получение</h2>
          <p className="sf-body">
            {order.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}
          </p>
          <p className="sf-small text-muted">
            {order.fulfillmentDate} · {order.timeWindowLabel}
          </p>
          {order.deliverySummary ? (
            <p className="sf-small text-muted">{order.deliverySummary}</p>
          ) : null}
          {order.pickupSummary ? (
            <p className="sf-small text-muted">{order.pickupSummary}</p>
          ) : null}
          {order.recipientSummary ? (
            <p className="sf-small text-muted">{order.recipientSummary}</p>
          ) : null}
          {order.hasCardMessage ? (
            <p className="sf-small text-muted">
              Открытка{order.anonymousCard ? ' (без указания отправителя)' : ''}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <h2 className="sf-h3">Состав</h2>
          <ul className="divide-y divide-border">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-3 py-3">
                <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-brand-soft">
                  {item.primaryImageUrl ? (
                    <Image
                      src={item.primaryImageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.productName}</p>
                  <p className="sf-small text-muted">
                    {item.variantName} · × {item.quantity}
                  </p>
                </div>
                <p className="sf-small shrink-0 tabular-nums">
                  {formatPriceFromMinor(item.lineTotalMinor, item.currency)}
                </p>
              </li>
            ))}
          </ul>
          <div className="border-t border-border pt-3">
            <p className="sf-price flex justify-between text-lg">
              <span>Итого</span>
              <span className="tabular-nums">
                {formatPriceFromMinor(order.totalMinor, order.currency)}
              </span>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

'use client';

import { useState } from 'react';
import type { ComponentUnit, ProductPublicDto } from '@bouquet-one/contracts';
import type { FulfillmentSettingsPublicDto } from '@bouquet-one/contracts';

type TabId = 'delivery' | 'description' | 'specs';

type Props = {
  product: ProductPublicDto;
  fulfillment: FulfillmentSettingsPublicDto | null;
  deliverySummary: string | null;
  substitutionNote: string | null;
  city?: string | null;
};

function unitLabel(unit: ComponentUnit): string {
  switch (unit) {
    case 'PIECE':
    case 'STEM':
      return 'шт.';
    case 'BUNCH':
      return 'пуч.';
    default:
      return '';
  }
}

function formatFee(minor: string, currency: string): string {
  const value = Number(minor);
  if (!Number.isFinite(value) || value <= 0) return 'Бесплатно';
  return `${(value / 100).toFixed(0)} ${currency}`;
}

function formatLeadTime(minutes: number): string | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `от ${minutes} мин`;
  const hours = Math.round(minutes / 60);
  return `от ${hours} ч`;
}

export function ProductDetailTabs({
  product,
  fulfillment,
  deliverySummary,
  substitutionNote,
  city,
}: Props) {
  const [tab, setTab] = useState<TabId>('delivery');

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'delivery', label: 'Доставка, оплата' },
    { id: 'description', label: 'Описание' },
    { id: 'specs', label: 'Характеристики' },
  ];

  return (
    <div className="sf-pdp-tabs">
      <div className="sf-pdp-tabs__list" role="tablist" aria-label="Информация о букете">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="sf-pdp-tabs__tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="sf-pdp-tabs__panel" role="tabpanel">
        {tab === 'delivery' ? (
          <DeliveryPanel
            fulfillment={fulfillment}
            deliverySummary={deliverySummary}
            city={city}
          />
        ) : null}

        {tab === 'description' ? (
          <div className="space-y-3">
            {product.description ? (
              <p className="sf-body whitespace-pre-line text-muted">{product.description}</p>
            ) : (
              <p className="sf-body text-muted">Описание появится позже.</p>
            )}
            {substitutionNote ? (
              <p className="sf-small text-muted">{substitutionNote}</p>
            ) : null}
          </div>
        ) : null}

        {tab === 'specs' ? <SpecsPanel product={product} /> : null}
      </div>
    </div>
  );
}

function DeliveryPanel({
  fulfillment,
  deliverySummary,
  city,
}: {
  fulfillment: FulfillmentSettingsPublicDto | null;
  deliverySummary: string | null;
  city?: string | null;
}) {
  const rows: Array<{ title: string; meta: string }> = [];

  if (fulfillment?.deliveryEnabled) {
    rows.push({
      title: 'Курьерская доставка',
      meta: [
        formatFee(fulfillment.deliveryFeeMinor, fulfillment.currency),
        formatLeadTime(fulfillment.minLeadTimeMinutes),
      ]
        .filter(Boolean)
        .join(' · '),
    });
  } else if (city) {
    rows.push({
      title: 'Доставка',
      meta: `По ${city}. Менеджер подтвердит время после заказа.`,
    });
  }

  if (fulfillment?.pickupEnabled) {
    rows.push({
      title: 'Самовывоз',
      meta: fulfillment.pickupInstructions?.trim() || 'Бесплатно',
    });
  }

  if (fulfillment && fulfillment.timeWindows.length > 0) {
    rows.push({
      title: 'Окна',
      meta: fulfillment.timeWindows
        .slice(0, 4)
        .map((window) => window.label)
        .join(' · '),
    });
  }

  if (deliverySummary?.trim()) {
    rows.push({ title: 'Важно', meta: deliverySummary.trim() });
  }

  rows.push({
    title: 'Оплата',
    meta: 'Наличными или картой при получении',
  });

  return (
    <ul className="sf-pdp-delivery">
      {rows.map((row) => (
        <li key={row.title}>
          <span className="sf-pdp-delivery__title">{row.title}</span>
          <span className="sf-pdp-delivery__meta">{row.meta}</span>
        </li>
      ))}
    </ul>
  );
}

function SpecsPanel({ product }: { product: ProductPublicDto }) {
  const rows: Array<{ label: string; value: string }> = [];

  if (product.bouquetSize) rows.push({ label: 'Размер', value: product.bouquetSize.name });
  if (product.heightCm != null) rows.push({ label: 'Высота', value: `${product.heightCm} см` });
  if (product.colors.length > 0) {
    rows.push({ label: 'Цвет', value: product.colors.map((c) => c.name).join(', ') });
  }
  if (product.flowers.length > 0) {
    rows.push({ label: 'Цветы', value: product.flowers.map((f) => f.name).join(', ') });
  }
  if (product.components.length > 0) {
    rows.push({
      label: 'Состав',
      value: product.components
        .map((item) => {
          const qty =
            item.quantity != null
              ? ` × ${item.quantity}${unitLabel(item.unit) ? ` ${unitLabel(item.unit)}` : ''}`
              : '';
          return `${item.displayName}${qty}`;
        })
        .join(', '),
    });
  }

  if (rows.length === 0) {
    return <p className="sf-body text-muted">Характеристики появятся позже.</p>;
  }

  return (
    <dl className="sf-pdp-specs">
      {rows.map((row) => (
        <div key={row.label} className="sf-pdp-specs__row">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

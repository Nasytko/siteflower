'use client';

import { useState } from 'react';
import type { ProductPublicDto } from '@bouquet-one/contracts';
import { formatPriceFromMinor } from '@/lib/media';

type Variant = ProductPublicDto['variants'][number];

type Props = {
  variants: Variant[];
  currency: string;
  fallbackLabel: string;
};

export function VariantPicker({ variants, currency, fallbackLabel }: Props) {
  const sorted = [...variants].sort((a, b) => a.sortOrder - b.sortOrder);
  const [selectedId, setSelectedId] = useState(sorted[0]?.id ?? '');
  const selected = sorted.find((v) => v.id === selectedId) ?? sorted[0];
  const priceLabel = selected
    ? formatPriceFromMinor(selected.priceMinor, currency)
    : fallbackLabel;

  if (sorted.length <= 1) {
    return <p className="sf-price text-2xl tracking-tight">{priceLabel}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="sf-price text-2xl tracking-tight" aria-live="polite">
        {priceLabel}
      </p>
      <div>
        <p className="sf-label mb-2">Вариант</p>
        <div className="flex flex-wrap gap-2" role="listbox" aria-label="Варианты букета">
          {sorted.map((variant) => {
            const active = variant.id === selected?.id;
            const variantPrice = formatPriceFromMinor(variant.priceMinor, currency);
            return (
              <button
                key={variant.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`min-h-11 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition ${
                  active
                    ? 'bg-brand text-brand-foreground'
                    : 'bg-brand-soft text-foreground hover:opacity-90'
                }`}
                onClick={() => setSelectedId(variant.id)}
              >
                <span className="font-medium">{variant.name}</span>
                <span className={`mt-0.5 block tabular-nums ${active ? 'text-brand-foreground/90' : 'text-muted'}`}>
                  {variantPrice}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

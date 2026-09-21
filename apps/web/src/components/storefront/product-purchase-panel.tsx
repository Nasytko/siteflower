'use client';

import { useEffect, useState } from 'react';
import type { ProductPublicDto } from '@bouquet-one/contracts';
import { formatPriceFromMinor } from '@/lib/media';
import { trackEvent } from '@/lib/analytics';
import {
  addToCart,
  readCart,
  writeCart,
} from '@/lib/cart';

type Variant = ProductPublicDto['variants'][number];

type Props = {
  product: Pick<
    ProductPublicDto,
    'id' | 'name' | 'slug' | 'currency' | 'availability' | 'price' | 'media'
  >;
  variants: Variant[];
  phone?: string | null;
};

export function ProductPurchasePanel({ product, variants, phone }: Props) {
  const sorted = [...variants].sort((a, b) => a.sortOrder - b.sortOrder);
  const [selectedId, setSelectedId] = useState(sorted[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);

  const selected = sorted.find((v) => v.id === selectedId) ?? sorted[0];
  const priceLabel = selected
    ? formatPriceFromMinor(selected.priceMinor, product.currency)
    : product.price.label;

  const blocked = product.availability === 'TEMPORARILY_UNAVAILABLE' || !selected;

  useEffect(() => {
    const sync = () => {
      const cart = readCart();
      setCartCount(cart.items.reduce((s, i) => s + i.quantity, 0));
    };
    sync();
    window.addEventListener('bouquet:cart', sync as EventListener);
    return () => window.removeEventListener('bouquet:cart', sync as EventListener);
  }, []);

  function onAdd() {
    if (!selected || blocked) return;
    const primary =
      product.media.find((m) => m.isPrimary)?.url ?? product.media[0]?.url ?? null;
    const next = addToCart(readCart(), {
      productId: product.id,
      variantId: selected.id,
      quantity: qty,
      productName: product.name,
      productSlug: product.slug,
      variantName: selected.name,
      unitPriceMinor: selected.priceMinor,
      primaryImageUrl: primary,
    });
    writeCart(next);
    trackEvent('add_to_cart', {
      productId: product.id,
      variantId: selected.id,
      quantity: qty,
    });
    setFeedback('Добавлено в корзину');
    window.setTimeout(() => setFeedback(null), 2500);
  }

  return (
    <div className="space-y-4">
      <p className="sf-price text-2xl tracking-tight" aria-live="polite">
        {priceLabel}
      </p>

      {sorted.length > 1 ? (
        <div>
          <p className="sf-label mb-2">Вариант</p>
          <div className="flex flex-wrap gap-2" role="listbox" aria-label="Варианты букета">
            {sorted.map((variant) => {
              const active = variant.id === selected?.id;
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
                  <span
                    className={`mt-0.5 block tabular-nums ${
                      active ? 'text-brand-foreground/90' : 'text-muted'
                    }`}
                  >
                    {formatPriceFromMinor(variant.priceMinor, product.currency)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="sf-small text-muted">
          Кол-во
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={qty}
            disabled={blocked}
            onChange={(e) => setQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="ml-2 w-16 rounded-[var(--radius-md)] border border-border bg-surface px-2 py-2 text-foreground"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          disabled={blocked}
          onClick={onAdd}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-brand px-6 py-3 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Добавить в корзину
        </button>
        {phone ? (
          <a
            href={`tel:${phone.replace(/\s+/g, '')}`}
            className="sf-small text-muted underline-offset-2 hover:text-brand hover:underline"
          >
            Или уточнить по телефону
          </a>
        ) : null}
      </div>

      {feedback ? (
        <p className="sf-small text-brand" role="status">
          {feedback}
          {cartCount > 0 ? (
            <>
              {' · '}
              <a href="/cart" className="underline-offset-2 hover:underline">
                Корзина ({cartCount})
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

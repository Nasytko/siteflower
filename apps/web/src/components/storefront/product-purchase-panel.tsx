'use client';

import { useEffect, useState } from 'react';
import type { ProductPublicDto } from '@bouquet-one/contracts';
import { formatPriceFromMinor } from '@/lib/media';
import { trackEvent } from '@/lib/analytics';
import { addToCart, readCart, writeCart } from '@/lib/cart';

type Variant = ProductPublicDto['variants'][number];

type Props = {
  product: Pick<
    ProductPublicDto,
    'id' | 'name' | 'slug' | 'currency' | 'availability' | 'price' | 'media' | 'categories'
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
  const [hydrated, setHydrated] = useState(false);

  const selected = sorted.find((v) => v.id === selectedId) ?? sorted[0];
  const priceLabel = selected
    ? formatPriceFromMinor(selected.priceMinor, product.currency)
    : product.price.label;

  const blocked = product.availability === 'TEMPORARILY_UNAVAILABLE' || !selected;

  useEffect(() => {
    setHydrated(true);
  }, []);

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
    <div className="space-y-5" data-purchase-ready={hydrated ? 'true' : 'false'}>
      {product.availability === 'AVAILABLE' ? (
        <p className="sf-small flex items-center gap-2 text-success">
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-success/15" aria-hidden>
            <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2.5 6.2L4.8 8.5 9.5 3.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          В наличии · можно заказать сегодня
        </p>
      ) : null}

      <p className="sf-price text-[1.85rem] tracking-tight text-ink" aria-live="polite">
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
                  className={`min-h-11 rounded-full px-4 py-2 text-left text-sm transition ${
                    active
                      ? 'bg-[var(--color-peach)] text-white'
                      : 'border border-border bg-white text-foreground hover:border-brand/30'
                  }`}
                  onClick={() => setSelectedId(variant.id)}
                >
                  <span className="font-medium">{variant.name}</span>
                  <span
                    className={`mt-0.5 block tabular-nums ${active ? 'text-white/85' : 'text-muted'}`}
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
            className="ml-2 w-16 rounded-full border border-border bg-white px-2 py-2 text-center text-foreground"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          disabled={blocked || !hydrated}
          onClick={onAdd}
          data-testid="add-to-cart"
          className="sf-cta disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:transform-none"
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
        <p className="sf-small text-brand" role="status" data-testid="add-to-cart-status">
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

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-background/95 p-2.5 shadow-[var(--shadow-lift)] backdrop-blur-md">
          <div className="min-w-0 flex-1 pl-1">
            <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
            <p className="sf-price text-base text-brand">{priceLabel}</p>
          </div>
          <button
            type="button"
            disabled={blocked || !hydrated}
            onClick={onAdd}
            className="sf-cta shrink-0 px-4 py-2.5 text-[0.7rem] disabled:cursor-not-allowed disabled:opacity-50"
          >
            В корзину
          </button>
        </div>
      </div>
    </div>
  );
}

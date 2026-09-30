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
    'id' | 'name' | 'slug' | 'currency' | 'availability' | 'price' | 'promotion' | 'media'
  >;
  variants: Variant[];
  phone?: string | null;
};

export function ProductPurchasePanel({ product, variants, phone }: Props) {
  const sorted = [...variants].sort((a, b) => a.sortOrder - b.sortOrder);
  const [selectedId, setSelectedId] = useState(sorted[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [quickPhone, setQuickPhone] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const selected = sorted.find((v) => v.id === selectedId) ?? sorted[0];
  const priceLabel = selected
    ? formatPriceFromMinor(selected.effectivePriceMinor, product.currency)
    : product.price.label;
  const discounted =
    selected != null && selected.effectivePriceMinor !== selected.priceMinor;
  const originalLabel =
    discounted && selected ? formatPriceFromMinor(selected.priceMinor, product.currency) : null;
  const percentOff = product.promotion?.percentOff ?? null;
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
      unitPriceMinor: selected.effectivePriceMinor,
      primaryImageUrl: primary,
    });
    writeCart(next);
    trackEvent('add_to_cart', {
      productId: product.id,
      variantId: selected.id,
      quantity: qty,
    });
    setFeedback('Добавлено в корзину');
    window.setTimeout(() => setFeedback(null), 2800);
  }

  function onQuickOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!phone) return;
    const digits = quickPhone.replace(/\D/g, '');
    if (digits.length < 7) {
      setFeedback('Укажите телефон для быстрого заказа');
      return;
    }
    window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
  }

  return (
    <div className="sf-pdp-buy" data-purchase-ready={hydrated ? 'true' : 'false'}>
      <div className="sf-pdp-buy__meta">
        {product.availability === 'AVAILABLE' ? (
          <span className="sf-pdp-badge sf-pdp-badge--ok">В наличии</span>
        ) : (
          <span className="sf-pdp-badge">Временно нет</span>
        )}
      </div>

      {sorted.length > 1 ? (
        <div className="sf-pdp-buy__block">
          <p className="sf-label mb-2.5">Размер</p>
          <div className="sf-pdp-variants" role="listbox" aria-label="Размер букета">
            {sorted.map((variant) => {
              const active = variant.id === selected?.id;
              const compact = variant.name.trim().length <= 3;
              return (
                <button
                  key={variant.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`sf-pdp-variant ${compact ? 'sf-pdp-variant--round' : ''} ${
                    active ? 'sf-pdp-variant--active' : ''
                  }`}
                  onClick={() => setSelectedId(variant.id)}
                >
                  <span className="sf-pdp-variant__name">{variant.name}</span>
                  {!compact ? (
                    <span className="sf-pdp-variant__price">
                      {formatPriceFromMinor(variant.effectivePriceMinor, product.currency)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="sf-pdp-buy__price" aria-live="polite">
        <p className={`sf-price sf-pdp-buy__amount ${discounted ? 'sf-price--sale' : ''}`}>
          {priceLabel}
        </p>
        {originalLabel ? (
          <p className="sf-price-was">
            <span className="sr-only">Обычная цена </span>
            {originalLabel}
          </p>
        ) : null}
        {percentOff != null ? <span className="sf-sale-chip">−{percentOff}%</span> : null}
      </div>

      <div className="sf-pdp-buy__qty">
        <span className="sf-label">Кол-во</span>
        <div className="sf-stepper">
          <button
            type="button"
            aria-label="Меньше"
            disabled={blocked || qty <= 1}
            onClick={() => setQty((n) => Math.max(1, n - 1))}
          >
            −
          </button>
          <span aria-live="polite">{qty}</span>
          <button
            type="button"
            aria-label="Больше"
            disabled={blocked || qty >= 20}
            onClick={() => setQty((n) => Math.min(20, n + 1))}
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={blocked || !hydrated}
        onClick={onAdd}
        data-testid="add-to-cart"
        className="sf-cta-block w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        Добавить в корзину
      </button>

      {phone ? (
        <form className="sf-pdp-quick" onSubmit={onQuickOrder}>
          <span className="sf-label">Быстрый заказ</span>
          <div className="sf-pdp-quick__row">
            <input
              type="tel"
              inputMode="tel"
              placeholder="+375 …"
              value={quickPhone}
              onChange={(e) => setQuickPhone(e.target.value)}
              className="sf-pdp-quick__input"
              aria-label="Телефон для быстрого заказа"
            />
            <button type="submit" className="sf-pdp-quick__go" aria-label="Позвонить">
              →
            </button>
          </div>
          <a href={`tel:${phone.replace(/\s+/g, '')}`} className="sf-pdp-buy__call">
            или {phone}
          </a>
        </form>
      ) : null}

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
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-border/80 bg-white/95 p-2.5 shadow-[var(--shadow-soft)] backdrop-blur">
          <div className="min-w-0 flex-1 pl-1">
            <p className={`sf-price text-base ${discounted ? 'sf-price--sale' : ''}`}>{priceLabel}</p>
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

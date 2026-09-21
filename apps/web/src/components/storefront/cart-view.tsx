'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPriceFromMinor } from '@/lib/media';
import { trackEvent } from '@/lib/analytics';
import {
  cartItemCount,
  clearCart,
  readCart,
  removeFromCart,
  setCartQuantity,
  writeCart,
  type CartState,
} from '@/lib/cart';

export function CartView() {
  const [cart, setCart] = useState<CartState>({ version: 1, items: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setCart(readCart());
    sync();
    setReady(true);
    trackEvent('view_cart', { itemCount: cartItemCount(readCart()) });
    window.addEventListener('bouquet:cart', sync as EventListener);
    return () => window.removeEventListener('bouquet:cart', sync as EventListener);
  }, []);

  function update(next: CartState) {
    writeCart(next);
    setCart(next);
  }

  if (!ready) {
    return <p className="sf-body text-muted">Загрузка…</p>;
  }

  if (cart.items.length === 0) {
    return (
      <div className="space-y-4">
        <p className="sf-body text-muted">Корзина пуста</p>
        <Link href="/bukety" className="text-sm font-medium text-brand hover:underline">
          Перейти в каталог
        </Link>
      </div>
    );
  }

  const subtotal = cart.items.reduce((sum, line) => {
    const unit = BigInt(line.unitPriceMinor ?? '0');
    return sum + unit * BigInt(line.quantity);
  }, 0n);

  return (
    <div className="space-y-8">
      <ul className="divide-y divide-border">
        {cart.items.map((line) => {
          const unit = BigInt(line.unitPriceMinor ?? '0');
          const lineTotal = unit * BigInt(line.quantity);
          return (
            <li key={line.variantId} className="flex gap-4 py-5">
              <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-brand-soft">
                {line.primaryImageUrl ? (
                  <Image
                    src={line.primaryImageUrl}
                    alt={line.productName ?? ''}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/bukety/${line.productSlug ?? ''}`}
                  className="sf-h3 text-foreground hover:text-brand"
                >
                  {line.productName ?? 'Букет'}
                </Link>
                <p className="sf-small mt-1 text-muted">{line.variantName}</p>
                <p className="sf-small mt-1 tabular-nums text-muted">
                  {formatPriceFromMinor(unit.toString())} × {line.quantity}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="sf-small text-muted">
                    Кол-во
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      value={line.quantity}
                      onChange={(e) =>
                        update(
                          setCartQuantity(
                            cart,
                            line.variantId,
                            Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                          ),
                        )
                      }
                      className="ml-2 w-16 rounded-[var(--radius-md)] border border-border bg-surface px-2 py-1.5"
                    />
                  </label>
                  <button
                    type="button"
                    className="sf-small text-muted underline-offset-2 hover:text-brand hover:underline"
                    onClick={() => {
                      trackEvent('remove_from_cart', { variantId: line.variantId });
                      update(removeFromCart(cart, line.variantId));
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <p className="sf-price shrink-0 tabular-nums">
                {formatPriceFromMinor(lineTotal.toString())}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="sf-label">Итого</p>
          <p className="sf-price mt-1 text-xl">{formatPriceFromMinor(subtotal.toString())}</p>
          <p className="sf-small mt-1 text-muted">Точная сумма подтверждается при оформлении</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="sf-small text-muted underline-offset-2 hover:underline"
            onClick={() => update(clearCart())}
          >
            Очистить
          </button>
          <Link
            href="/checkout"
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-brand px-6 py-3 text-sm font-medium text-brand-foreground hover:opacity-90"
          >
            Оформить заказ
          </Link>
        </div>
      </div>
    </div>
  );
}

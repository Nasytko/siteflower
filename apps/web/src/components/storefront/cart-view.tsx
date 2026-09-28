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
      <div className="sf-panel px-6 py-12 text-center sm:px-10 sm:py-14">
        <p className="sf-h2">Корзина ждёт букет</p>
        <p className="sf-body mx-auto mt-3 max-w-sm text-muted">
          Выберите свежий букет — мы бережно соберём и доставим.
        </p>
        <Link href="/bukety" className="sf-cta mt-8 inline-flex">
          Смотреть каталог
        </Link>
      </div>
    );
  }

  const subtotal = cart.items.reduce((sum, line) => {
    const unit = BigInt(line.unitPriceMinor ?? '0');
    return sum + unit * BigInt(line.quantity);
  }, 0n);
  const count = cartItemCount(cart);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-10">
      <ul className="space-y-4">
        {cart.items.map((line) => {
          const unit = BigInt(line.unitPriceMinor ?? '0');
          const lineTotal = unit * BigInt(line.quantity);
          return (
            <li
              key={line.variantId}
              className="flex gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-3 transition-colors hover:border-border-strong sm:gap-5 sm:p-4"
            >
              <Link
                href={`/bukety/${line.productSlug ?? ''}`}
                className="relative h-28 w-24 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-surface-muted sm:h-32 sm:w-28"
              >
                {line.primaryImageUrl ? (
                  <Image
                    src={line.primaryImageUrl}
                    alt={line.productName ?? ''}
                    fill
                    className="object-cover transition duration-500 hover:scale-105"
                    sizes="112px"
                  />
                ) : null}
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/bukety/${line.productSlug ?? ''}`}
                      className="sf-h3 text-foreground transition hover:text-brand"
                    >
                      {line.productName ?? 'Букет'}
                    </Link>
                    {line.variantName ? (
                      <p className="sf-small mt-1 text-muted">{line.variantName}</p>
                    ) : null}
                  </div>
                  <p className="sf-price shrink-0 text-brand">
                    {formatPriceFromMinor(lineTotal.toString())}
                  </p>
                </div>

                <p className="sf-small mt-2 tabular-nums text-muted">
                  {formatPriceFromMinor(unit.toString())} за шт.
                </p>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                  <div
                    className="inline-flex items-center rounded-full bg-surface ring-1 ring-border"
                    role="group"
                    aria-label="Количество"
                  >
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lg text-foreground transition hover:bg-brand-soft"
                      aria-label="Меньше"
                      onClick={() =>
                        update(
                          setCartQuantity(cart, line.variantId, Math.max(1, line.quantity - 1)),
                        )
                      }
                    >
                      −
                    </button>
                    <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lg text-foreground transition hover:bg-brand-soft"
                      aria-label="Больше"
                      disabled={line.quantity >= 20}
                      onClick={() =>
                        update(
                          setCartQuantity(cart, line.variantId, Math.min(20, line.quantity + 1)),
                        )
                      }
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    className="sf-small rounded-full px-3 py-2 text-muted transition hover:bg-accent-soft hover:text-accent"
                    onClick={() => {
                      trackEvent('remove_from_cart', { variantId: line.variantId });
                      update(removeFromCart(cart, line.variantId));
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="sf-panel-ink p-5 sm:p-6 lg:sticky lg:top-24">
        <p className="sf-label text-brand-foreground/55">Ваш заказ</p>
        <p className="sf-h2 mt-2 text-white">
          {count} {count === 1 ? 'букет' : count < 5 ? 'букета' : 'букетов'}
        </p>
        <div className="mt-5 flex items-end justify-between gap-3 border-t border-white/15 pt-5">
          <div>
            <p className="sf-label text-brand-foreground/55">Итого</p>
            <p className="sf-price mt-1 text-2xl text-white">
              {formatPriceFromMinor(subtotal.toString())}
            </p>
          </div>
        </div>
        <p className="sf-small mt-3 text-brand-foreground/60">
          Точная сумма подтверждается при оформлении
        </p>
        <Link href="/checkout" className="sf-cta-light mt-6 w-full">
          Оформить заказ
        </Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/bukety"
            className="sf-small text-brand-foreground/70 underline-offset-2 hover:text-white hover:underline"
          >
            ← В каталог
          </Link>
          <button
            type="button"
            className="sf-small text-brand-foreground/55 underline-offset-2 hover:text-white hover:underline"
            onClick={() => update(clearCart())}
          >
            Очистить
          </button>
        </div>
      </aside>
    </div>
  );
}

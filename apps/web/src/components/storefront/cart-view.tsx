'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPriceFromMinor } from '@/lib/media';
import { trackEvent } from '@/lib/analytics';
import {
  clearCart,
  readCart,
  cartLineKey,
  removeFromCart,
  setCartQuantity,
  syncCardDraftWithCart,
  writeCart,
  type CartState,
} from '@/lib/cart';
import {
  cartCompositionCount,
  cartLineSubtitle,
  compositionCountLabel,
  isStemBouquetLine,
  stemCountLabel,
  unitPriceSuffix,
} from '@/lib/cart-labels';

export function CartView() {
  const [cart, setCart] = useState<CartState>({ version: 1, items: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setCart(readCart());
    sync();
    setReady(true);
    trackEvent('view_cart', { itemCount: cartCompositionCount(readCart()) });
    window.addEventListener('bouquet:cart', sync as EventListener);
    return () => window.removeEventListener('bouquet:cart', sync as EventListener);
  }, []);

  function update(next: CartState) {
    syncCardDraftWithCart(next);
    writeCart(next);
    setCart(next);
  }

  if (!ready) {
    return <p className="sf-cart-loading">Загрузка…</p>;
  }

  if (cart.items.length === 0) {
    return (
      <div className="sf-cart-empty">
        <p className="sf-cart-empty__title">Корзина пока пуста</p>
        <p className="sf-cart-empty__text">
          Выберите букет — мы бережно соберём и доставим в нужный момент.
        </p>
        <Link href="/catalog/bouquets" className="sf-cta sf-cart-empty__cta">
          Смотреть каталог
        </Link>
      </div>
    );
  }

  const subtotal = cart.items.reduce((sum, line) => {
    const unit = BigInt(line.unitPriceMinor ?? '0');
    const options = BigInt(line.optionsTotalMinor ?? '0');
    return sum + unit * BigInt(line.quantity) + options;
  }, 0n);
  const count = cartCompositionCount(cart);

  return (
    <div className="sf-cart">
      <ul className="sf-cart__list">
        {cart.items.map((line) => {
          const key = cartLineKey(line);
          const unit = BigInt(line.unitPriceMinor ?? '0');
          const options = BigInt(line.optionsTotalMinor ?? '0');
          const lineTotal = unit * BigInt(line.quantity) + options;
          const stemLine = isStemBouquetLine(line);
          const subtitle = cartLineSubtitle(line);
          return (
            <li key={key} className="sf-cart__item">
              <Link
                href={`/products/${line.productSlug ?? ''}`}
                className="sf-cart__thumb"
              >
                {line.primaryImageUrl ? (
                  <Image
                    src={line.primaryImageUrl}
                    alt={line.productName ?? ''}
                    fill
                    className="object-cover"
                    sizes="112px"
                  />
                ) : null}
              </Link>

              <div className="sf-cart__body">
                <div className="sf-cart__top">
                  <div className="sf-cart__info">
                    <Link
                      href={`/products/${line.productSlug ?? ''}`}
                      className="sf-cart__name"
                    >
                      {line.productName ?? 'Букет'}
                    </Link>
                    {subtitle ? <p className="sf-cart__meta">{subtitle}</p> : null}
                    {!stemLine && line.variantName && subtitle !== line.variantName ? (
                      <p className="sf-cart__meta">{line.variantName}</p>
                    ) : null}
                    {line.optionValueIds && line.optionValueIds.length > 0 && options > 0n ? (
                      <p className="sf-cart__meta">
                        +{formatPriceFromMinor(options.toString())} упаковка
                      </p>
                    ) : null}
                    <p className="sf-cart__unit">
                      {formatPriceFromMinor(unit.toString())} {unitPriceSuffix(line.productKind)}
                    </p>
                  </div>
                  <p className="sf-cart__line-total">
                    {formatPriceFromMinor(lineTotal.toString())}
                  </p>
                </div>

                <div className="sf-cart__actions">
                  <div
                    className="sf-cart-qty"
                    role="group"
                    aria-label={stemLine ? 'Количество веток в букете' : 'Количество'}
                  >
                    <button
                      type="button"
                      aria-label="Меньше"
                      onClick={() =>
                        update(setCartQuantity(cart, key, Math.max(1, line.quantity - 1)))
                      }
                    >
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button
                      type="button"
                      aria-label="Больше"
                      disabled={line.quantity >= 20}
                      onClick={() =>
                        update(setCartQuantity(cart, key, Math.min(20, line.quantity + 1)))
                      }
                    >
                      +
                    </button>
                  </div>
                  {stemLine ? (
                    <span className="sf-cart__stem">{stemCountLabel(line.quantity)}</span>
                  ) : null}
                  <button
                    type="button"
                    className="sf-cart__remove"
                    onClick={() => {
                      trackEvent('remove_from_cart', { variantId: line.variantId });
                      update(removeFromCart(cart, key));
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

      <aside className="sf-cart__summary">
        <p className="sf-cart__summary-label">Ваш заказ</p>
        <p className="sf-cart__summary-count">{compositionCountLabel(count)}</p>
        <div className="sf-cart__summary-total">
          <span>Итого</span>
          <strong>{formatPriceFromMinor(subtotal.toString())}</strong>
        </div>
        <p className="sf-cart__summary-note">
          Точная сумма и доставка подтверждаются при оформлении
        </p>
        <Link href="/checkout" className="sf-cta sf-cart__checkout">
          Оформить заказ
        </Link>
        <div className="sf-cart__summary-links">
          <Link href="/catalog/bouquets">← В каталог</Link>
          <button type="button" onClick={() => update(clearCart())}>
            Очистить
          </button>
        </div>
      </aside>
    </div>
  );
}

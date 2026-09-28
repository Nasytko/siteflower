'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import type { ProductListItemDto } from '@bouquet-one/contracts';
import { addToCart, readCart, writeCart } from '@/lib/cart';
import { FavoriteButton } from './favorite-button';

type Props = {
  product: ProductListItemDto;
  priority?: boolean;
  /** Card image sizes attribute — grids and scroll rows differ. */
  sizes?: string;
};

const DEFAULT_SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw';

function availabilityLabel(availability: ProductListItemDto['availability']): {
  tone: 'ok' | 'note';
  text: string;
} | null {
  switch (availability) {
    case 'AVAILABLE':
      return { tone: 'ok', text: 'В наличии' };
    case 'TEMPORARILY_UNAVAILABLE':
      return { tone: 'note', text: 'Временно недоступен' };
    case 'PREORDER':
      return { tone: 'note', text: 'Под заказ' };
    case 'SEASONAL':
      return { tone: 'note', text: 'Сезонный' };
    default:
      return null;
  }
}

export function ProductCard({ product, priority = false, sizes = DEFAULT_SIZES }: Props) {
  const [added, setAdded] = useState(false);

  const availability = availabilityLabel(product.availability);
  const canQuickAdd = product.availability === 'AVAILABLE' && product.defaultVariant != null;

  // Promotion truth comes from the API only — never recomputed in the browser.
  const promotion = product.promotion;
  const priceLabel = promotion?.salePrice.label ?? product.price?.label ?? null;
  const originalLabel = promotion ? promotion.originalPrice.label : null;
  const percentOff = promotion?.percentOff ?? null;

  function onAddToCart(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!product.defaultVariant) return;
    const next = addToCart(readCart(), {
      productId: product.id,
      variantId: product.defaultVariant.id,
      quantity: 1,
      productName: product.name,
      productSlug: product.slug,
      variantName: product.defaultVariant.name,
      unitPriceMinor: product.defaultVariant.priceMinor,
      primaryImageUrl: product.primaryImageUrl,
    });
    writeCart(next);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <article className="sf-product-card group">
      <div className="sf-product-card__media">
        <Link
          href={`/bukety/${product.slug}`}
          className="absolute inset-0 block outline-offset-4"
          aria-label={`${product.name}${priceLabel ? `, ${priceLabel}` : ''}`}
        >
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={product.name}
              fill
              sizes={sizes}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              priority={priority}
            />
          ) : (
            <div className="flex h-full items-end bg-[var(--color-surface-muted)] p-4 text-sm text-muted">
              Фото скоро
            </div>
          )}
        </Link>

        {percentOff != null ? (
          <span className="sf-sale-badge" aria-hidden={false}>
            −{percentOff}%
          </span>
        ) : promotion ? (
          <span className="sf-sale-badge sf-sale-badge--text" aria-hidden={false}>
            Акция
          </span>
        ) : null}

        <div className="absolute right-2.5 top-2.5 z-[2]">
          <FavoriteButton productId={product.id} slug={product.slug} />
        </div>
      </div>

      <div className="sf-product-card__body">
        {availability ? (
          <p
            className={`sf-product-card__stock ${
              availability.tone === 'ok' ? 'sf-product-card__stock--ok' : ''
            }`}
          >
            {availability.tone === 'ok' ? (
              <svg viewBox="0 0 12 12" className="size-3.5 shrink-0" fill="none" aria-hidden>
                <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.2" />
                <path
                  d="M3.4 6.2 5.1 7.9 8.6 4.2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
            {availability.text}
          </p>
        ) : null}

        <h3 className="sf-product-card__title">
          <Link href={`/bukety/${product.slug}`}>{product.name}</Link>
        </h3>

        {priceLabel ? (
          <p className="sf-product-card__price">
            <span className={`sf-price ${promotion ? 'sf-price--sale' : ''}`}>{priceLabel}</span>
            {originalLabel ? (
              <span className="sf-price-was">
                <span className="sr-only">Обычная цена </span>
                {originalLabel}
              </span>
            ) : null}
          </p>
        ) : null}

        {canQuickAdd ? (
          <button
            type="button"
            className="sf-cta-block"
            onClick={onAddToCart}
            aria-live="polite"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4 shrink-0 opacity-90"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path
                d="M6 7h15l-1.4 8.2a2 2 0 0 1-2 1.6H9.2a2 2 0 0 1-2-1.6L5.2 4H3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="20" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="17" cy="20" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            {added ? 'Добавлено' : 'В корзину'}
          </button>
        ) : (
          <Link href={`/bukety/${product.slug}`} className="sf-cta-block">
            Смотреть
          </Link>
        )}
      </div>
    </article>
  );
}

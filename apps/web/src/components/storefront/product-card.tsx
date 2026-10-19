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
  /** `compact` — homepage shelves: stock chip on the photo, stacked prices, round cart. */
  variant?: 'default' | 'compact';
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

export function ProductCard({
  product,
  priority = false,
  sizes = DEFAULT_SIZES,
  variant = 'default',
}: Props) {
  const [added, setAdded] = useState(false);
  const compact = variant === 'compact';

  const availability = availabilityLabel(product.availability);
  const canQuickAdd = product.availability === 'AVAILABLE' && product.defaultVariant != null;

  // Promotion truth comes from the API only — never recomputed in the browser.
  const promotion = product.promotion;
  const priceLabel = promotion?.salePrice.label ?? product.price?.label ?? null;
  const originalLabel = promotion ? promotion.originalPrice.label : null;
  const percentOff = promotion?.percentOff ?? null;
  const displayName = product.name?.trim() || 'Без названия';

  function onAddToCart(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!product.defaultVariant) return;
    const next = addToCart(readCart(), {
      productId: product.id,
      variantId: product.defaultVariant.id,
      quantity: 1,
      productName: displayName,
      productSlug: product.slug,
      variantName: product.defaultVariant.name,
      unitPriceMinor: product.defaultVariant.priceMinor,
      primaryImageUrl: product.primaryImageUrl,
    });
    writeCart(next);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  const stock = availability ? (
    <p
      className={`sf-product-card__stock ${
        availability.tone === 'ok' ? 'sf-product-card__stock--ok' : ''
      }`}
    >
      {availability.tone === 'ok' ? (
        compact ? (
          <svg viewBox="0 0 16 16" className="sf-product-card__stock-icon" aria-hidden>
            <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="m5.4 8.2 1.8 1.8 3.5-3.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span className="sf-product-card__stock-dot" aria-hidden />
        )
      ) : null}
      {availability.text}
    </p>
  ) : null;

  return (
    <article className={`sf-product-card group ${compact ? 'sf-product-card--compact' : ''}`}>
      <div className="sf-product-card__media">
        <Link
          href={`/bukety/${product.slug}`}
          className="absolute inset-0 block outline-offset-4"
          aria-label={`${displayName}${priceLabel ? `, ${priceLabel}` : ''}`}
        >
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={displayName}
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

        <div className="sf-product-card__fav absolute right-2.5 top-2.5 z-[2]">
          <FavoriteButton productId={product.id} slug={product.slug} />
        </div>

        {compact ? stock : null}
      </div>

      <div className="sf-product-card__body">
        {compact ? null : stock}

        <h3 className="sf-product-card__title">
          <Link href={`/bukety/${product.slug}`}>{displayName}</Link>
        </h3>

        {product.cardSubtitle && !compact ? (
          <p className="sf-small mt-0.5 text-muted">{product.cardSubtitle}</p>
        ) : null}

        <div className="sf-product-card__buy">
          <p className="sf-product-card__price">
            {priceLabel ? (
              compact ? (
                <>
                  {originalLabel ? (
                    <span className="sf-price-was">
                      <span className="sr-only">Обычная цена </span>
                      {originalLabel}
                    </span>
                  ) : null}
                  <span className={`sf-price ${promotion ? 'sf-price--sale' : ''}`}>
                    {priceLabel}
                  </span>
                </>
              ) : (
                <>
                  <span className={`sf-price ${promotion ? 'sf-price--sale' : ''}`}>
                    {priceLabel}
                  </span>
                  {originalLabel ? (
                    <span className="sf-price-was">
                      <span className="sr-only">Обычная цена </span>
                      {originalLabel}
                    </span>
                  ) : null}
                </>
              )
            ) : (
              <span className="sf-small text-muted">Цена уточняется</span>
            )}
          </p>

          {canQuickAdd ? (
            <button
              type="button"
              className="sf-product-card__cart"
              onClick={onAddToCart}
              aria-live="polite"
              aria-label={added ? 'Добавлено в корзину' : 'В корзину'}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 shrink-0"
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
            </button>
          ) : (
            <Link
              href={`/bukety/${product.slug}`}
              className="sf-product-card__cart"
              aria-label="Смотреть товар"
            >
              →
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import type { ProductListItemDto } from '@bouquet-one/contracts';
import { packagingFromCategories } from '@/lib/packaging';
import { addToCart, readCart, writeCart } from '@/lib/cart';
import { FavoriteButton } from './favorite-button';
import { HeightRuler } from './height-ruler';

type Props = {
  product: ProductListItemDto;
  priority?: boolean;
};

function availabilityHint(availability: ProductListItemDto['availability']): {
  label: string;
  tone: 'ok' | 'muted' | 'warm';
} | null {
  switch (availability) {
    case 'AVAILABLE':
      return { label: 'В наличии', tone: 'ok' };
    case 'TEMPORARILY_UNAVAILABLE':
      return { label: 'Временно недоступен', tone: 'muted' };
    case 'PREORDER':
      return { label: 'Под заказ', tone: 'warm' };
    case 'SEASONAL':
      return { label: 'Сезонный', tone: 'warm' };
    default:
      return null;
  }
}

export function ProductCard({ product, priority = false }: Props) {
  const hint = availabilityHint(product.availability);
  const packaging = packagingFromCategories(product.categories);
  const canQuickAdd =
    product.availability === 'AVAILABLE' && product.defaultVariant != null;
  const [added, setAdded] = useState(false);
  const hasHeight = product.heightCm != null && product.heightCm > 0;

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
    <article className="sf-product-card group relative flex h-full flex-col">
      <Link
        href={`/bukety/${product.slug}`}
        className="flex flex-1 flex-col outline-offset-2"
        aria-label={`${product.name}, ${product.price?.label ?? 'цена по запросу'}${
          hasHeight ? `, высота ${product.heightCm} см` : ''
        }`}
      >
        <div className="sf-product-card__media relative aspect-[4/5] overflow-hidden">
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              priority={priority}
            />
          ) : (
            <div className="flex h-full items-end p-4 text-sm text-muted">Фото скоро</div>
          )}

          <div className="absolute left-2 top-2 z-[1] flex flex-col gap-1.5">
            {product.featured ? (
              <span className="sf-discount-badge" title="Хит">
                хит
              </span>
            ) : null}
          </div>

          <div className="absolute bottom-2 left-2 z-[1] flex flex-wrap gap-1.5">
            {hasHeight ? (
              <span className="sf-height-chip transition duration-500 group-hover:opacity-0 group-hover:translate-y-1">
                {product.heightCm}&nbsp;см
              </span>
            ) : null}
            <span className="sf-packaging-chip">{packaging.label}</span>
          </div>

          {hasHeight ? (
            <HeightRuler heightCm={product.heightCm!} mode="hover" side="right" />
          ) : null}
        </div>

        <div className="mt-3 flex flex-1 flex-col gap-1 px-0.5">
          {hint ? (
            <p
              className={`sf-small inline-flex items-center gap-1.5 transition-colors ${
                hint.tone === 'ok'
                  ? 'text-success'
                  : hint.tone === 'warm'
                    ? 'text-accent'
                    : 'text-muted'
              }`}
            >
              {hint.tone === 'ok' ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.2" />
                  <path
                    d="M3.4 6.2 5.1 7.9 8.6 4.2"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
              {hint.label}
            </p>
          ) : null}

          <h3 className="sf-h3 line-clamp-2 min-h-[2.6em] text-foreground transition-colors duration-300 group-hover:text-brand">
            {product.name}
          </h3>

          {product.price ? (
            <p className="sf-price mt-1 text-ink">{product.price.label}</p>
          ) : null}
        </div>
      </Link>

      <div className="mt-3 px-0.5">
        {canQuickAdd ? (
          <button type="button" className="sf-cta-block" onClick={onAddToCart} aria-live="polite">
            {added ? 'Добавлено' : 'В корзину'}
          </button>
        ) : (
          <Link href={`/bukety/${product.slug}`} className="sf-cta-block">
            Смотреть
          </Link>
        )}
      </div>

      <div className="absolute right-2 top-2 z-10">
        <FavoriteButton productId={product.id} slug={product.slug} />
      </div>
    </article>
  );
}

'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductPublicDto } from '@bouquet-one/contracts';
import { pickDerivativeUrl, productImageAlt, sortProductMedia } from '@/lib/media';
import { FavoriteButton } from './favorite-button';
import { HeightRuler } from './height-ruler';

type MediaItem = ProductPublicDto['media'][number];

type Props = {
  media: MediaItem[];
  productId: string;
  productSlug: string;
  productName: string;
  /** Optional merchandising height — ruler on the photo when set. */
  heightCm?: number | null;
  promotionPercent?: number | null;
};

const VISIBLE_THUMBS = 5;

export function ProductGallery({
  media,
  productId,
  productSlug,
  productName,
  heightCm = null,
  promotionPercent = null,
}: Props) {
  const sorted = sortProductMedia(media);
  const [activeIndex, setActiveIndex] = useState(0);
  const [thumbStart, setThumbStart] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const showHeight = heightCm != null && heightCm > 0;
  const count = sorted.length;

  const select = useCallback(
    (index: number, scrollStrip = true) => {
      const next = (index + count) % Math.max(count, 1);
      setActiveIndex(next);
      if (next < thumbStart) setThumbStart(next);
      if (next >= thumbStart + VISIBLE_THUMBS) setThumbStart(next - VISIBLE_THUMBS + 1);
      const strip = stripRef.current;
      if (scrollStrip && strip) {
        strip.scrollTo({ left: next * strip.clientWidth, behavior: 'smooth' });
      }
    },
    [count, thumbStart],
  );

  function onStripScroll() {
    const strip = stripRef.current;
    if (!strip || strip.clientWidth === 0) return;
    const index = Math.round(strip.scrollLeft / strip.clientWidth);
    if (index !== activeIndex) setActiveIndex(Math.min(count - 1, Math.max(0, index)));
  }

  const overlay = (
    <>
      <div className="sf-pdp-gallery__fav">
        <FavoriteButton productId={productId} slug={productSlug} />
      </div>
      {promotionPercent != null ? (
        <span className="sf-sale-badge">−{promotionPercent}%</span>
      ) : null}
      {showHeight ? <HeightRuler heightCm={heightCm} mode="always" side="left" /> : null}
    </>
  );

  if (count === 0) {
    return (
      <div className="sf-pdp-gallery sf-pdp-gallery--empty">
        <div className="sf-pdp-gallery__main">
          <div className="sf-pdp-gallery__frame">
            <span className="sf-pdp-gallery__placeholder">Фото скоро</span>
            {overlay}
          </div>
        </div>
      </div>
    );
  }

  const thumbsOverflow = count > VISIBLE_THUMBS;
  const visibleThumbs = thumbsOverflow
    ? sorted.slice(thumbStart, thumbStart + VISIBLE_THUMBS)
    : sorted;

  return (
    <div className="sf-pdp-gallery">
      {count > 1 ? (
        <div className="sf-pdp-gallery__rail" aria-label="Фотографии букета">
          {thumbsOverflow && thumbStart > 0 ? (
            <button
              type="button"
              className="sf-pdp-gallery__rail-nav"
              aria-label="Предыдущие фото"
              onClick={() => setThumbStart((n) => Math.max(0, n - 1))}
            >
              <Chevron dir="up" />
            </button>
          ) : null}
          <ul className="sf-pdp-gallery__thumbs">
            {visibleThumbs.map((item, offset) => {
              const index = thumbsOverflow ? thumbStart + offset : offset;
              return (
                <li key={`thumb-${item.url}-${index}`}>
                  <Thumb
                    item={item}
                    index={index}
                    selected={index === activeIndex}
                    onSelect={() => select(index)}
                  />
                </li>
              );
            })}
          </ul>
          {thumbsOverflow && thumbStart + VISIBLE_THUMBS < count ? (
            <button
              type="button"
              className="sf-pdp-gallery__rail-nav"
              aria-label="Следующие фото"
              onClick={() => setThumbStart((n) => Math.min(count - VISIBLE_THUMBS, n + 1))}
            >
              <Chevron dir="down" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="sf-pdp-gallery__main">
        <div className="sf-pdp-gallery__frame">
          <div
            ref={stripRef}
            className="sf-pdp-gallery__strip"
            onScroll={onStripScroll}
          >
            {sorted.map((item, index) => (
              <div key={`${item.url}-${index}`} className="sf-pdp-gallery__slide">
                <Image
                  src={pickDerivativeUrl(item, 1200) ?? item.url}
                  alt={productImageAlt(productName, item.alt)}
                  fill
                  sizes="(max-width: 1023px) 100vw, 36rem"
                  className="object-cover"
                  priority={index === 0}
                />
              </div>
            ))}
          </div>
          {overlay}
          {count > 1 ? (
            <span className="sf-pdp-gallery__counter" aria-live="polite">
              {activeIndex + 1}/{count}
            </span>
          ) : null}
          <button
            type="button"
            className="sf-pdp-gallery__zoom"
            aria-label="Открыть фото на весь экран"
            onClick={() => setLightbox(true)}
          >
            <ExpandIcon />
          </button>
        </div>

        {count > 1 ? (
          <ul className="sf-pdp-gallery__thumbs sf-pdp-gallery__thumbs--row">
            {sorted.map((item, index) => (
              <li key={`row-${item.url}-${index}`}>
                <Thumb
                  item={item}
                  index={index}
                  selected={index === activeIndex}
                  onSelect={() => select(index)}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {lightbox ? (
        <Lightbox
          items={sorted}
          index={activeIndex}
          productName={productName}
          onIndex={(index) => select(index)}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </div>
  );
}

function Thumb({
  item,
  index,
  selected,
  onSelect,
}: {
  item: MediaItem;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Фото ${index + 1}`}
      aria-pressed={selected}
      className="sf-pdp-gallery__thumb"
      data-active={selected ? 'true' : 'false'}
      onClick={onSelect}
    >
      <Image
        src={pickDerivativeUrl(item, 200) ?? item.url}
        alt=""
        fill
        sizes="80px"
        className="object-cover"
      />
    </button>
  );
}

function Lightbox({
  items,
  index,
  productName,
  onIndex,
  onClose,
}: {
  items: MediaItem[];
  index: number;
  productName: string;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = items[index] ?? items[0];
  const many = items.length > 1;

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (many && event.key === 'ArrowRight') onIndex(index + 1);
      if (many && event.key === 'ArrowLeft') onIndex(index - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [index, many, onClose, onIndex]);

  if (!item) return null;

  return (
    <div
      className="sf-pdp-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Фото: ${productName}`}
      onClick={onClose}
    >
      <div className="sf-pdp-lightbox__frame" onClick={(event) => event.stopPropagation()}>
        <Image
          src={item.url}
          alt={productImageAlt(productName, item.alt)}
          fill
          sizes="100vw"
          className="object-contain"
        />
      </div>
      <button
        ref={closeRef}
        type="button"
        className="sf-pdp-lightbox__close"
        aria-label="Закрыть"
        onClick={onClose}
      >
        ×
      </button>
      {many ? (
        <>
          <button
            type="button"
            className="sf-pdp-lightbox__nav sf-pdp-lightbox__nav--prev"
            aria-label="Предыдущее фото"
            onClick={(event) => {
              event.stopPropagation();
              onIndex(index - 1);
            }}
          >
            <Chevron dir="left" />
          </button>
          <button
            type="button"
            className="sf-pdp-lightbox__nav sf-pdp-lightbox__nav--next"
            aria-label="Следующее фото"
            onClick={(event) => {
              event.stopPropagation();
              onIndex(index + 1);
            }}
          >
            <Chevron dir="right" />
          </button>
          <span className="sf-pdp-lightbox__counter">
            {index + 1}/{items.length}
          </span>
        </>
      ) : null}
    </div>
  );
}

function Chevron({ dir }: { dir: 'up' | 'down' | 'left' | 'right' }) {
  const rotate = { down: 0, up: 180, left: 90, right: -90 }[dir];
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotate}deg)` }}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

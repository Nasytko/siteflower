'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
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
  const [lightbox, setLightbox] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const showHeight = heightCm != null && heightCm > 0;
  const count = sorted.length;

  const select = useCallback(
    (index: number) => {
      const next = (index + count) % Math.max(count, 1);
      setActiveIndex(next);
    },
    [count],
  );

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

  function onTouchStart(event: TouchEvent) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null || count < 2) return;
    const end = event.changedTouches[0]?.clientX;
    if (end == null) return;
    const delta = end - start;
    if (Math.abs(delta) < 48) return;
    select(delta < 0 ? activeIndex + 1 : activeIndex - 1);
  }

  return (
    <div className="sf-pdp-gallery">
      <div className="sf-pdp-gallery__main">
        <div
          className="sf-pdp-gallery__frame"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="sf-pdp-gallery__stage" aria-live="polite">
            {sorted.map((item, index) => (
              <div
                key={`${item.url}-${index}`}
                className="sf-pdp-gallery__slide"
                data-active={index === activeIndex ? 'true' : 'false'}
              >
                <Image
                  src={pickDerivativeUrl(item, 1200) ?? item.url}
                  alt={productImageAlt(productName, item.alt)}
                  fill
                  sizes="(max-width: 1023px) 100vw, 36rem"
                  className="sf-pdp-gallery__image object-cover"
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
          <ul className="sf-pdp-gallery__thumbs" aria-label="Фотографии букета">
            {sorted.map((item, index) => (
              <li key={`thumb-${item.url}-${index}`}>
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

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  const rotate = { left: 90, right: -90 }[dir];
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

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export type HeroSlide = {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl: string;
  mobileImageUrl?: string | null;
  kicker?: string | null;
};

type Props = {
  slides: HeroSlide[];
  /** Delivery note in the corner badge — omit when empty. */
  deliveryNote?: string | null;
  intervalMs?: number;
};

/**
 * Contained homepage hero — rounded stage, photo fill, controlled copy overlay.
 */
export function ExpandingHero({ slides, deliveryNote = null, intervalMs = 7000 }: Props) {
  const safeSlides = slides.length > 0 ? slides : [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = safeSlides.length;

  const go = useCallback(
    (next: number) => {
      if (count <= 1) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  const goNext = useCallback(() => go(index + 1), [go, index]);
  const goPrev = useCallback(() => go(index - 1), [go, index]);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [count, paused, intervalMs]);

  if (count === 0) return null;

  return (
    <section
      className="sf-hero"
      aria-roledescription="carousel"
      aria-label="Главный баннер"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="sf-container-wide">
        <div
          className="sf-hero__stage"
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            touchX.current = null;
            if (start == null) return;
            const end = e.changedTouches[0]?.clientX;
            if (end == null) return;
            const dx = end - start;
            if (Math.abs(dx) < 40) return;
            if (dx < 0) goNext();
            else goPrev();
          }}
        >
          {safeSlides.map((slide, i) => {
            const isActive = i === index;
            const kicker = slide.kicker?.trim() || 'Сезонная коллекция';
            return (
              <div
                key={slide.id}
                className={`sf-hero__slide ${isActive ? 'sf-hero__slide--active' : ''}`}
                aria-hidden={!isActive}
              >
                <div className="sf-hero__media">
                  {slide.mobileImageUrl ? (
                    <>
                      <Image
                        src={slide.mobileImageUrl}
                        alt=""
                        fill
                        priority={i === 0}
                        sizes="(max-width: 1100px) 100vw, 80rem"
                        className="object-cover sm:hidden"
                      />
                      <Image
                        src={slide.imageUrl}
                        alt=""
                        fill
                        priority={i === 0}
                        sizes="(max-width: 1100px) 100vw, 80rem"
                        className="object-cover hidden sm:block"
                      />
                    </>
                  ) : (
                    <Image
                      src={slide.imageUrl}
                      alt=""
                      fill
                      priority={i === 0}
                      sizes="(max-width: 1100px) 100vw, 80rem"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="sf-hero__overlay">
                  <p className="sf-hero__kicker">{kicker}</p>
                  {i === 0 ? (
                    <h1 className="sf-hero__headline">
                      <HeadlineText title={slide.title} />
                    </h1>
                  ) : (
                    <p className="sf-hero__headline">
                      <HeadlineText title={slide.title} />
                    </p>
                  )}
                  {slide.subtitle ? (
                    <p className="sf-hero__subtitle">{slide.subtitle}</p>
                  ) : null}
                  <Link href={slide.ctaHref} className="sf-home-btn sf-hero__cta">
                    {slide.ctaLabel}
                    <span aria-hidden> →</span>
                  </Link>
                </div>
              </div>
            );
          })}

          {deliveryNote ? (
            <p className="sf-hero__badge">
              <TruckIcon />
              <span>{deliveryNote}</span>
            </p>
          ) : null}

          {count > 1 ? (
            <>
              <button
                type="button"
                className="sf-hero__nav sf-hero__nav--prev"
                aria-label="Предыдущий слайд"
                onClick={goPrev}
              >
                ‹
              </button>
              <button
                type="button"
                className="sf-hero__nav sf-hero__nav--next"
                aria-label="Следующий слайд"
                onClick={goNext}
              >
                ›
              </button>
              <div className="sf-hero__dots" role="tablist" aria-label="Слайды">
                {safeSlides.map((slide, i) => (
                  <button
                    key={slide.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Слайд ${i + 1}: ${slide.title}`}
                    className={`sf-hero__dot ${i === index ? 'sf-hero__dot--active' : ''}`}
                    onClick={() => setIndex(i)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Last word of the slide title is set in the italic accent face. */
function HeadlineText({ title }: { title: string }) {
  const trimmed = title.trim();
  const cut = trimmed.lastIndexOf(' ');
  if (cut <= 0) return <>{trimmed}</>;
  return (
    <>
      {trimmed.slice(0, cut)}{' '}
      <em className="sf-hero__accent">{trimmed.slice(cut + 1)}</em>
    </>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sf-hero__badge-icon" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M3 7.5h11v9H3zM14 10.5h4.2L21 14v2.5h-7" strokeLinejoin="round" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </svg>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextCompactFromScroll } from '@/lib/scroll-chrome';

export type HeroSlide = {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl: string;
  brandName?: string;
};

type Props = {
  slides: HeroSlide[];
  intervalMs?: number;
};

/**
 * Content-width hero at rest; expands to full-bleed on scroll
 * (same hysteresis as the sticky header). Height stays stable —
 * only width / radius / padding animate.
 */
export function ExpandingHero({ slides, intervalMs = 6500 }: Props) {
  const safeSlides = slides.length > 0 ? slides : [];
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const expandedRef = useRef(false);
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
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      expandedRef.current = true;
      setExpanded(true);
      return;
    }
    const onScroll = () => {
      // Reuse header hysteresis: scrolled → expanded full-bleed.
      const next = nextCompactFromScroll(window.scrollY, expandedRef.current);
      if (next === expandedRef.current) return;
      expandedRef.current = next;
      setExpanded(next);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
      className={`sf-hero ${expanded ? 'sf-hero--expanded' : 'sf-hero--inset'}`}
      aria-roledescription="carousel"
      aria-label="Главный баннер"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="sf-hero__frame">
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
            return (
              <div
                key={slide.id}
                className={`sf-hero__slide ${isActive ? 'sf-hero__slide--active' : ''}`}
                aria-hidden={!isActive}
              >
                <div className="sf-hero__grid">
                  <div className="sf-hero__copy">
                    {slide.brandName ? (
                      <p className="sf-hero__brand">{slide.brandName}</p>
                    ) : null}
                    {i === 0 ? (
                      <h1 className="sf-h1 max-w-md text-white">{slide.title}</h1>
                    ) : (
                      <p className="sf-h1 max-w-md text-white">{slide.title}</p>
                    )}
                    <p className="sf-hero__subtitle sf-body max-w-sm text-white/75">
                      {slide.subtitle}
                    </p>
                    <Link href={slide.ctaHref} className="sf-cta-light sf-hero__cta w-fit">
                      {slide.ctaLabel}
                    </Link>
                  </div>
                  <div className="sf-hero__media">
                    <Image
                      src={slide.imageUrl}
                      alt=""
                      fill
                      priority={i === 0}
                      sizes="100vw"
                      className="object-cover"
                    />
                  </div>
                </div>
              </div>
            );
          })}

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
                    aria-label={`Слайд ${i + 1}`}
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

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

export type AutumnPromoCard = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  imageUrl: string;
  imageAlt: string;
};

type Props = {
  slides: HeroSlide[];
  brandName: string;
  autumnCards: AutumnPromoCard[];
  intervalMs?: number;
};

/**
 * Split hero: autumn promo cards on the left, full-bleed photo carousel on the right.
 * Expands to full-bleed on scroll (same hysteresis as the sticky header).
 */
export function ExpandingHero({
  slides,
  brandName,
  autumnCards,
  intervalMs = 6500,
}: Props) {
  const safeSlides = slides.length > 0 ? slides : [];
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const expandedRef = useRef(false);
  const touchX = useRef<number | null>(null);

  const count = safeSlides.length;
  const active = safeSlides[index] ?? safeSlides[0];

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
      aria-label="Главный баннер"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="sf-hero__frame">
        <div className="sf-hero__split">
          <aside className="sf-hero-autumn" aria-label="Осенние букеты">
            <div className="sf-hero-autumn__intro">
              <p className="sf-hero-autumn__brand">{brandName}</p>
              <p className="sf-hero-autumn__kicker">Сезон тепла</p>
              <h1 className="sf-hero-autumn__title">Осенние букеты</h1>
              <p className="sf-hero-autumn__lead">
                Янтарь, бордо и сухая зелень — букеты, которые держат осень в руках.
              </p>
            </div>

            <ul className="sf-hero-autumn__cards">
              {autumnCards.map((card) => (
                <li key={card.id}>
                  <Link href={card.href} className="sf-hero-autumn__card">
                    <span className="sf-hero-autumn__card-media" aria-hidden>
                      <Image
                        src={card.imageUrl}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 45vw, 18vw"
                        className="object-cover"
                      />
                    </span>
                    <span className="sf-hero-autumn__card-body">
                      <span className="sf-hero-autumn__card-title">{card.title}</span>
                      <span className="sf-hero-autumn__card-sub">{card.subtitle}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>

          <div
            className="sf-hero__stage"
            aria-roledescription="carousel"
            aria-label="Фотогалерея"
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
                  <div className="sf-hero__media sf-hero__media--bleed">
                    <Image
                      src={slide.imageUrl}
                      alt=""
                      fill
                      priority={i === 0}
                      sizes="(max-width: 768px) 100vw, 60vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="sf-hero__slide-caption">
                    <p className="sf-hero__slide-title">{slide.title}</p>
                    <Link href={slide.ctaHref} className="sf-hero__slide-cta">
                      {slide.ctaLabel}
                    </Link>
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
                      aria-label={`Слайд ${i + 1}: ${slide.title}`}
                      className={`sf-hero__dot ${i === index ? 'sf-hero__dot--active' : ''}`}
                      onClick={() => setIndex(i)}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {active ? (
              <span
                className="absolute h-px w-px overflow-hidden whitespace-nowrap"
                style={{ clip: 'rect(0, 0, 0, 0)' }}
                aria-live="polite"
              >
                {active.title}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

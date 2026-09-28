'use client';

import { useRef, useState } from 'react';
import type { BestsellerGroupPublicDto } from '@bouquet-one/contracts';
import { ProductCard } from './product-card';
import { SectionRail } from './section-rail';

type Props = {
  heading: string;
  /** Admin-curated groups; each group already carries its products. */
  groups: BestsellerGroupPublicDto[];
};

const MAX_PER_GROUP = 8;

export function BestsellersSection({ heading, groups }: Props) {
  const usable = groups.filter((group) => group.products.length > 0);
  const [activeId, setActiveId] = useState(usable[0]?.id ?? '');
  const scrollerRef = useRef<HTMLUListElement>(null);

  if (usable.length === 0) return null;

  const active = usable.find((group) => group.id === activeId) ?? usable[0]!;
  const showNav = active.products.length > 4;

  function scrollByCard(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.85, 280);
    el.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  return (
    <section className="sf-band-surface py-12 md:py-16">
      <div className="sf-container-wide">
        <SectionRail title={heading} href="/bukety" linkLabel="Смотреть все" />

        {usable.length > 1 ? (
          <div
            className="mb-7 flex justify-center gap-1 overflow-x-auto px-1 pb-1"
            role="tablist"
            aria-label="Подборки бестселлеров"
          >
            {usable.map((group) => {
              const selected = group.id === active.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  className="sf-tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveId(group.id)}
                >
                  {group.name}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="sf-carousel">
          {showNav ? (
            <>
              <button
                type="button"
                className="sf-carousel__nav sf-carousel__nav--prev"
                aria-label="Предыдущие букеты"
                onClick={() => scrollByCard(-1)}
              >
                <Chevron direction="left" />
              </button>
              <button
                type="button"
                className="sf-carousel__nav sf-carousel__nav--next"
                aria-label="Следующие букеты"
                onClick={() => scrollByCard(1)}
              >
                <Chevron direction="right" />
              </button>
            </>
          ) : null}

          <ul
            ref={scrollerRef}
            className="sf-scroll-row"
            aria-label={active.title || active.name}
            role="tabpanel"
          >
            {active.products.slice(0, MAX_PER_GROUP).map((product, index) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  priority={index < 2}
                  sizes="(max-width: 640px) 72vw, (max-width: 1024px) 45vw, 22vw"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      {direction === 'left' ? (
        <path d="M14.5 6 9 12l5.5 6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9.5 6 15 12l-5.5 6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

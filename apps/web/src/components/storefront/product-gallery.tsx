'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ProductPublicDto } from '@bouquet-one/contracts';
import { pickDerivativeUrl } from '@/lib/media';

type MediaItem = ProductPublicDto['media'][number];

type Props = {
  media: MediaItem[];
  productName: string;
};

export function ProductGallery({ media, productName }: Props) {
  const sorted = [...media].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const active = sorted[activeIndex] ?? sorted[0];

  if (sorted.length === 0) {
    return (
      <div className="flex aspect-[4/5] items-end rounded-[var(--radius-md)] bg-brand-soft p-6 text-sm text-muted">
        Фото скоро
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Mobile / all: scroll-snap strip */}
      <div
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth md:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {sorted.map((item, index) => {
          const src = pickDerivativeUrl(item, 900) ?? item.url;
          return (
            <div
              key={`${item.url}-${index}`}
              className="relative aspect-[4/5] w-[85%] shrink-0 snap-center overflow-hidden rounded-[var(--radius-md)] bg-brand-soft"
            >
              <Image
                src={src}
                alt={item.alt ?? productName}
                fill
                sizes="85vw"
                className="object-cover"
                priority={index === 0}
              />
            </div>
          );
        })}
      </div>

      {/* Desktop: main + thumbs */}
      <div className="hidden md:block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-md)] bg-brand-soft">
          {active ? (
            <Image
              src={pickDerivativeUrl(active, 1200) ?? active.url}
              alt={active.alt ?? productName}
              fill
              sizes="(max-width: 1024px) 50vw, 40vw"
              className="object-cover"
              priority
            />
          ) : null}
        </div>
        {sorted.length > 1 ? (
          <ul className="mt-3 flex gap-2 overflow-x-auto">
            {sorted.map((item, index) => {
              const src = pickDerivativeUrl(item, 200) ?? item.url;
              const selected = index === activeIndex;
              return (
                <li key={`thumb-${item.url}-${index}`}>
                  <button
                    type="button"
                    aria-label={`Фото ${index + 1}`}
                    aria-pressed={selected}
                    className={`relative h-20 w-16 overflow-hidden rounded-[var(--radius-sm)] bg-brand-soft ring-offset-2 transition ${
                      selected ? 'ring-2 ring-brand' : 'opacity-80 hover:opacity-100'
                    }`}
                    onClick={() => setActiveIndex(index)}
                  >
                    <Image src={src} alt="" fill sizes="64px" className="object-cover" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

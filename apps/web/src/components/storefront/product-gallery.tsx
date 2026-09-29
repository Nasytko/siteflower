'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ProductPublicDto } from '@bouquet-one/contracts';
import { pickDerivativeUrl, productImageAlt } from '@/lib/media';
import { HeightRuler } from './height-ruler';

type MediaItem = ProductPublicDto['media'][number];

type Props = {
  media: MediaItem[];
  productName: string;
  /** Optional merchandising height — ruler beside + bar under photos when set. */
  heightCm?: number | null;
  bouquetSizeName?: string | null;
  promotionPercent?: number | null;
};

export function ProductGallery({
  media,
  productName,
  heightCm = null,
  bouquetSizeName = null,
  promotionPercent = null,
}: Props) {
  const sorted = [...media].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const active = sorted[activeIndex] ?? sorted[0];
  const showHeight = heightCm != null && heightCm > 0;
  const heightValue = showHeight ? heightCm : null;
  const sizeCaption =
    heightValue != null
      ? `${heightValue} см`
      : bouquetSizeName
        ? bouquetSizeName
        : null;

  if (sorted.length === 0) {
    return (
      <div className="space-y-3">
        <div className="relative flex aspect-[4/5] items-end overflow-hidden rounded-[var(--radius-xl)] bg-brand-soft p-6 text-sm text-muted">
          Фото скоро
          {heightValue != null ? (
            <HeightRuler heightCm={heightValue} mode="always" side="right" />
          ) : null}
          {promotionPercent != null ? (
            <span className="sf-sale-badge">−{promotionPercent}%</span>
          ) : null}
        </div>
        {sizeCaption ? <SizeBar label={sizeCaption} /> : null}
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
              className="relative aspect-[4/5] w-[85%] shrink-0 snap-center overflow-hidden rounded-[var(--radius-xl)] bg-brand-soft"
            >
              <Image
                src={src}
                alt={productImageAlt(productName, item.alt)}
                fill
                sizes="85vw"
                className="object-cover"
                priority={index === 0}
              />
              {heightValue != null && index === 0 ? (
                <HeightRuler heightCm={heightValue} mode="always" side="right" />
              ) : null}
              {promotionPercent != null && index === 0 ? (
                <span className="sf-sale-badge">−{promotionPercent}%</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {sizeCaption ? (
        <div className="md:hidden">
          <SizeBar label={sizeCaption} />
        </div>
      ) : null}

      {/* Desktop: thumbs + main */}
      <div className="hidden md:grid md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-3">
        {sorted.length > 1 ? (
          <ul className="flex flex-col gap-2">
            {sorted.map((item, index) => {
              const src = pickDerivativeUrl(item, 200) ?? item.url;
              const selected = index === activeIndex;
              return (
                <li key={`thumb-${item.url}-${index}`}>
                  <button
                    type="button"
                    aria-label={`Фото ${index + 1}`}
                    aria-pressed={selected}
                    className={`relative h-[4.5rem] w-full overflow-hidden rounded-[var(--radius-md)] bg-brand-soft ring-offset-2 transition ${
                      selected ? 'ring-2 ring-brand' : 'opacity-80 hover:opacity-100'
                    }`}
                    onClick={() => setActiveIndex(index)}
                  >
                    <Image src={src} alt="" fill sizes="72px" className="object-cover" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div />
        )}

        <div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-xl)] bg-brand-soft shadow-[var(--shadow-soft)]">
            {active ? (
              <Image
                src={pickDerivativeUrl(active, 1200) ?? active.url}
                alt={productImageAlt(productName, active.alt)}
                fill
                sizes="(max-width: 1024px) 50vw, 40vw"
                className="object-cover"
                priority
              />
            ) : null}
            {heightValue != null ? (
              <HeightRuler heightCm={heightValue} mode="always" side="right" />
            ) : null}
            {promotionPercent != null ? (
              <span className="sf-sale-badge">−{promotionPercent}%</span>
            ) : null}
          </div>
          {sizeCaption ? (
            <div className="mt-3">
              <SizeBar label={sizeCaption} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Horizontal size caption under the photo — like a soft dimension line. */
function SizeBar({ label }: { label: string }) {
  return (
    <div className="sf-size-bar" aria-label={`Размер: ${label}`}>
      <span className="sf-size-bar__cap" aria-hidden />
      <span className="sf-size-bar__line" aria-hidden />
      <span className="sf-size-bar__label">{label}</span>
      <span className="sf-size-bar__line" aria-hidden />
      <span className="sf-size-bar__cap" aria-hidden />
    </div>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { MEGA_NAV, type MegaNavItem } from './mega-nav-data';

type Props = {
  /** Compact single-row mode (collapsed sticky header) */
  compact?: boolean;
};

export function MegaNav({ compact = false }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null);
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, []);

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenId(null), 220);
  }

  function open(id: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenId(id);
  }

  const active = MEGA_NAV.find((item) => item.id === openId && item.mega);
  const tileCount = active?.mega?.tiles.length ?? 0;

  return (
    <nav
      ref={rootRef}
      aria-label="Основное"
      className={`relative ${compact ? '' : 'border-t border-border/50'}`}
      onMouseLeave={scheduleClose}
    >
      <ul
        className={`sf-container-wide flex flex-wrap items-center justify-center ${
          compact ? 'gap-x-4 gap-y-1 py-0 xl:gap-x-6' : 'gap-x-5 gap-y-2 py-2.5 md:gap-x-7 md:py-3'
        }`}
      >
        {MEGA_NAV.map((item) => (
          <MegaNavTrigger
            key={item.id}
            item={item}
            open={openId === item.id}
            panelId={panelId}
            compact={compact}
            onOpen={() => (item.mega ? open(item.id) : undefined)}
            onFocusOpen={() => (item.mega ? open(item.id) : undefined)}
          />
        ))}
      </ul>

      {active?.mega ? (
        <div
          id={panelId}
          role="region"
          aria-label={`${active.label}: подменю`}
          className="absolute inset-x-0 top-full z-50 px-3 pt-2 sm:px-4"
          onMouseEnter={() => open(active.id)}
          onMouseLeave={scheduleClose}
        >
          <div className="sf-mega-panel sf-container-wide overflow-hidden rounded-[var(--radius-md)] border border-border/80 bg-white/98 p-3 shadow-[var(--shadow-soft)] backdrop-blur-sm sm:p-4">
            <ul
              className={`grid gap-2.5 sm:gap-3 ${
                tileCount > 4
                  ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7'
                  : 'grid-cols-2 sm:grid-cols-4'
              }`}
            >
              {active.mega.tiles.map((tile, index) => (
                <li
                  key={tile.id}
                  className="sf-mega-tile"
                  style={{ animationDelay: `${40 + index * 35}ms` }}
                >
                  <Link
                    href={tile.href}
                    className="group relative block h-full overflow-hidden rounded-[var(--radius-sm)] outline-offset-2"
                    onClick={() => setOpenId(null)}
                  >
                    <span className="relative block aspect-[3/4] min-h-[7.5rem] bg-surface sm:min-h-[8.5rem] md:aspect-[4/5]">
                      <Image
                        src={tile.imageSrc}
                        alt={tile.imageAlt}
                        fill
                        sizes="(max-width: 768px) 40vw, 12vw"
                        className="object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                      <span
                        className="absolute inset-0 bg-gradient-to-t from-ink/65 via-ink/15 to-transparent transition duration-300 group-hover:from-ink/75"
                        aria-hidden
                      />
                      <span className="absolute inset-x-0 bottom-0 p-2 text-sm font-semibold leading-snug text-white sm:p-2.5 sm:text-[0.9375rem]">
                        {tile.label}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-start border-t border-border/70 pt-3 sm:mt-4">
              <Link
                href={active.mega.seeAllHref}
                className="text-sm font-medium text-brand underline-offset-4 transition hover:underline"
                onClick={() => setOpenId(null)}
              >
                {active.mega.seeAllLabel} →
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}

function MegaNavTrigger({
  item,
  open,
  panelId,
  compact,
  onOpen,
  onFocusOpen,
}: {
  item: MegaNavItem;
  open: boolean;
  panelId: string;
  compact: boolean;
  onOpen: () => void;
  onFocusOpen: () => void;
}) {
  const className = `sf-nav-link relative inline-flex items-center gap-1 px-0.5 transition ${
    compact ? 'text-[0.8125rem]' : 'text-[0.875rem]'
  } ${
    item.accent
      ? 'text-accent'
      : open
        ? 'text-brand'
        : 'text-foreground hover:opacity-70'
  }`;

  if (!item.mega) {
    return (
      <li>
        <Link href={item.href} className={className}>
          {item.label}
        </Link>
      </li>
    );
  }

  return (
    <li onMouseEnter={onOpen}>
      <Link
        href={item.href}
        className={className}
        aria-expanded={open}
        aria-controls={panelId}
        onFocus={onFocusOpen}
      >
        {item.label}
        <span
          className={`mt-px inline-block text-[0.65em] transition duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          ▾
        </span>
        <span
          className={`absolute inset-x-1 -bottom-1 h-0.5 origin-center rounded-full bg-brand transition duration-300 ${
            open ? 'scale-x-100 opacity-100' : 'scale-x-50 opacity-0'
          }`}
          aria-hidden
        />
      </Link>
    </li>
  );
}

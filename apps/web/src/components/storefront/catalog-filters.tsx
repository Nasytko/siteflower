'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import type { TaxonomyRefDto } from '@bouquet-one/contracts';
import { PRICE_BANDS } from '@/lib/media';
import { trackEvent } from '@/lib/analytics';
import {
  catalogHasActiveFilters,
  catalogStateToQuery,
  type CatalogSearchState,
} from '@/lib/catalog-search-params';

export type CatalogFilterOptions = {
  flowers: TaxonomyRefDto[];
  colors: TaxonomyRefDto[];
  styles: TaxonomyRefDto[];
  categories: TaxonomyRefDto[];
  occasions: TaxonomyRefDto[];
  recipients: TaxonomyRefDto[];
};

type Props = {
  state: CatalogSearchState;
  options: CatalogFilterOptions;
  /** Render as always-visible sidebar (desktop) */
  variant?: 'sidebar' | 'drawer';
};

function ChipLink({
  href,
  active,
  children,
  onSelect,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  onSelect?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      className={`inline-flex rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm transition ${
        active
          ? 'bg-brand text-brand-foreground'
          : 'bg-brand-soft/70 text-foreground hover:bg-brand-soft'
      }`}
    >
      {children}
    </Link>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="sf-label">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function buildHref(
  base: CatalogSearchState,
  patch: Partial<CatalogSearchState>,
): string {
  const next: CatalogSearchState = {
    ...base,
    ...patch,
    page: 1,
  };
  // Clear conflicting price fields when switching mode
  if ('band' in patch && patch.band) {
    next.minPrice = undefined;
    next.maxPrice = undefined;
  }
  if ('minPrice' in patch || 'maxPrice' in patch) {
    next.band = undefined;
  }
  return `/bukety${catalogStateToQuery(next)}`;
}

function FiltersBody({
  state,
  options,
  onNavigate,
}: {
  state: CatalogSearchState;
  options: CatalogFilterOptions;
  onNavigate?: () => void;
}) {
  const clearHref = '/bukety';

  return (
    <div className="space-y-8">
      <FilterGroup title="Цена">
        {PRICE_BANDS.map((band) => (
          <ChipLink
            key={band.id}
            href={buildHref(state, { band: band.id })}
            active={state.band === band.id}
            onSelect={() => {
              trackEvent('select_filter', { key: 'band', value: band.id });
              onNavigate?.();
            }}
          >
            {band.label}
          </ChipLink>
        ))}
      </FilterGroup>

      {options.flowers.length > 0 ? (
        <FilterGroup title="Цветы">
          {options.flowers.map((item) => (
            <ChipLink
              key={item.id}
              href={buildHref(state, {
                flower: state.flower === item.slug ? undefined : item.slug,
              })}
              active={state.flower === item.slug}
              onSelect={() => {
                trackEvent('select_filter', { key: 'flower', value: item.slug });
                onNavigate?.();
              }}
            >
              {item.name}
            </ChipLink>
          ))}
        </FilterGroup>
      ) : null}

      {options.colors.length > 0 ? (
        <FilterGroup title="Цвет">
          {options.colors.map((item) => (
            <ChipLink
              key={item.id}
              href={buildHref(state, {
                color: state.color === item.slug ? undefined : item.slug,
              })}
              active={state.color === item.slug}
              onSelect={() => {
                trackEvent('select_filter', { key: 'color', value: item.slug });
                onNavigate?.();
              }}
            >
              {item.name}
            </ChipLink>
          ))}
        </FilterGroup>
      ) : null}

      {options.styles.length > 0 ? (
        <FilterGroup title="Стиль">
          {options.styles.map((item) => (
            <ChipLink
              key={item.id}
              href={buildHref(state, {
                style: state.style === item.slug ? undefined : item.slug,
              })}
              active={state.style === item.slug}
              onSelect={() => {
                trackEvent('select_filter', { key: 'style', value: item.slug });
                onNavigate?.();
              }}
            >
              {item.name}
            </ChipLink>
          ))}
        </FilterGroup>
      ) : null}

      {options.occasions.length > 0 ? (
        <FilterGroup title="Повод">
          {options.occasions.map((item) => (
            <ChipLink
              key={item.id}
              href={buildHref(state, {
                occasion: state.occasion === item.slug ? undefined : item.slug,
              })}
              active={state.occasion === item.slug}
              onSelect={() => {
                trackEvent('select_filter', { key: 'occasion', value: item.slug });
                onNavigate?.();
              }}
            >
              {item.name}
            </ChipLink>
          ))}
        </FilterGroup>
      ) : null}

      {options.recipients.length > 0 ? (
        <FilterGroup title="Кому">
          {options.recipients.map((item) => (
            <ChipLink
              key={item.id}
              href={buildHref(state, {
                recipient: state.recipient === item.slug ? undefined : item.slug,
              })}
              active={state.recipient === item.slug}
              onSelect={() => {
                trackEvent('select_filter', { key: 'recipient', value: item.slug });
                onNavigate?.();
              }}
            >
              {item.name}
            </ChipLink>
          ))}
        </FilterGroup>
      ) : null}

      {options.categories.length > 0 ? (
        <FilterGroup title="Категория">
          {options.categories.map((item) => (
            <ChipLink
              key={item.id}
              href={buildHref(state, {
                category: state.category === item.slug ? undefined : item.slug,
              })}
              active={state.category === item.slug}
              onSelect={() => {
                trackEvent('select_filter', { key: 'category', value: item.slug });
                onNavigate?.();
              }}
            >
              {item.name}
            </ChipLink>
          ))}
        </FilterGroup>
      ) : null}

      <Link
        href={clearHref}
        onClick={onNavigate}
        className="sf-small text-muted underline-offset-2 hover:text-brand hover:underline"
      >
        Сбросить фильтры
      </Link>
    </div>
  );
}

export function CatalogFilters({ state, options, variant = 'sidebar' }: Props) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const active = catalogHasActiveFilters(state);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (variant === 'sidebar') {
    return (
      <aside className="hidden w-56 shrink-0 lg:block xl:w-64">
        <p className="sf-h3 mb-6">Фильтры</p>
        <FiltersBody state={state} options={options} />
      </aside>
    );
  }

  return (
    <div className="lg:hidden">
      <button
        ref={openButtonRef}
        type="button"
        className={`inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-medium ${
          active ? 'border-brand bg-brand-soft text-foreground' : 'border-border bg-surface'
        }`}
        aria-expanded={open}
        aria-controls={drawerId}
        onClick={() => setOpen(true)}
      >
        Фильтры
        {active ? <span className="sf-small text-brand">· активны</span> : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-background"
          role="dialog"
          aria-modal="true"
          aria-label="Фильтры каталога"
          id={drawerId}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="sf-h3">Фильтры</p>
            <button
              ref={closeButtonRef}
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-brand-soft"
              aria-label="Закрыть фильтры"
              onClick={() => {
                setOpen(false);
                openButtonRef.current?.focus();
              }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M6 6 18 18M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-6 pb-28">
            <FiltersBody state={state} options={options} onNavigate={() => setOpen(false)} />
          </div>
          <div className="sticky bottom-0 border-t border-border bg-background px-4 py-3 safe-pb">
            <div className="flex gap-3">
              <Link
                href="/bukety"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-border px-4 text-sm font-medium"
                onClick={() => setOpen(false)}
              >
                Сбросить
              </Link>
              <button
                type="button"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] bg-brand px-4 text-sm font-medium text-brand-foreground"
                onClick={() => {
                  setOpen(false);
                  openButtonRef.current?.focus();
                }}
              >
                Показать
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CatalogSortSelect({ state }: { state: CatalogSearchState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onChange = useCallback(
    (value: string) => {
      const href = buildHref(state, {
        sort: value as CatalogSearchState['sort'],
      });
      startTransition(() => {
        router.push(href);
      });
    },
    [router, state],
  );

  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="sr-only">Сортировка</span>
      <select
        className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-foreground"
        value={state.sort}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="featured">По популярности</option>
        <option value="price_asc">Сначала дешевле</option>
        <option value="price_desc">Сначала дороже</option>
        <option value="newest">Новинки</option>
      </select>
    </label>
  );
}

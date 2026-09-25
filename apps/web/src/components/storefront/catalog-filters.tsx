'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import type { TaxonomyRefDto } from '@bouquet-one/contracts';
import { PRICE_BANDS } from '@/lib/media';
import { trackEvent } from '@/lib/analytics';
import {
  catalogActiveFilterCount,
  catalogHasActiveFilters,
  catalogStateToQuery,
  toggleSlug,
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

type FacetKey =
  | 'flowers'
  | 'colors'
  | 'styles'
  | 'categories'
  | 'occasions'
  | 'recipients';

function buildHref(base: CatalogSearchState, patch: Partial<CatalogSearchState>): string {
  const next: CatalogSearchState = {
    ...base,
    ...patch,
    page: 1,
  };
  if ('band' in patch && patch.band) {
    next.minPrice = undefined;
    next.maxPrice = undefined;
  }
  if ('minPrice' in patch || 'maxPrice' in patch) {
    next.band = undefined;
  }
  return `/bukety${catalogStateToQuery(next)}`;
}

function ChipButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center rounded-full px-3 py-1.5 text-sm transition ${
        active
          ? 'bg-peach text-ink shadow-[var(--shadow-soft)]'
          : 'bg-white text-foreground ring-1 ring-border hover:bg-brand-soft'
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="sf-label">{title}</p>
        {hint ? <p className="text-[0.7rem] text-muted">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FiltersBody({
  draft,
  onChange,
  onCommit,
  options,
}: {
  draft: CatalogSearchState;
  onChange: (next: CatalogSearchState) => void;
  /** When set (desktop), chips/bands navigate immediately; price commits on blur. */
  onCommit?: (next: CatalogSearchState) => void;
  options: CatalogFilterOptions;
}) {
  const priceMinId = useId();
  const priceMaxId = useId();

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const commit = (next: CatalogSearchState) => {
    onChange(next);
    onCommit?.(next);
  };

  const toggleFacet = (key: FacetKey, slug: string) => {
    const next = { ...draft, [key]: toggleSlug(draft[key], slug), page: 1 };
    trackEvent('select_filter', { key, value: slug });
    commit(next);
  };

  const setBand = (bandId: string) => {
    const next: CatalogSearchState = {
      ...draft,
      band: draft.band === bandId ? undefined : bandId,
      minPrice: undefined,
      maxPrice: undefined,
      page: 1,
    };
    trackEvent('select_filter', { key: 'band', value: bandId });
    commit(next);
  };

  const patchPrice = (patch: Pick<CatalogSearchState, 'minPrice' | 'maxPrice'>) => {
    const next: CatalogSearchState = {
      ...draftRef.current,
      ...patch,
      band: undefined,
      page: 1,
    };
    draftRef.current = next;
    onChange(next);
  };

  const commitPrice = () => {
    onCommit?.({ ...draftRef.current, page: 1 });
  };

  return (
    <div className="space-y-8">
      <FilterGroup title="Цена" hint="быстрый выбор">
        {PRICE_BANDS.map((band) => (
          <ChipButton key={band.id} active={draft.band === band.id} onClick={() => setBand(band.id)}>
            {band.label}
          </ChipButton>
        ))}
      </FilterGroup>

      <div className="space-y-2">
        <p className="sf-label">Свой диапазон, BYN</p>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={priceMinId}>
            Цена от
          </label>
          <input
            id={priceMinId}
            inputMode="numeric"
            placeholder="от"
            value={draft.minPrice ?? ''}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, '').slice(0, 6);
              patchPrice({ minPrice: value || undefined, maxPrice: draftRef.current.maxPrice });
            }}
            onBlur={commitPrice}
            className="min-h-10 w-full rounded-full border border-border bg-white px-3 text-sm"
          />
          <span className="text-muted">—</span>
          <label className="sr-only" htmlFor={priceMaxId}>
            Цена до
          </label>
          <input
            id={priceMaxId}
            inputMode="numeric"
            placeholder="до"
            value={draft.maxPrice ?? ''}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, '').slice(0, 6);
              patchPrice({ minPrice: draftRef.current.minPrice, maxPrice: value || undefined });
            }}
            onBlur={commitPrice}
            className="min-h-10 w-full rounded-full border border-border bg-white px-3 text-sm"
          />
        </div>
      </div>

      {options.colors.length > 0 ? (
        <FilterGroup title="Цвет" hint="несколько">
          {options.colors.map((item) => (
            <ChipButton
              key={item.id}
              active={draft.colors.includes(item.slug)}
              onClick={() => toggleFacet('colors', item.slug)}
            >
              {item.name}
            </ChipButton>
          ))}
        </FilterGroup>
      ) : null}

      {options.flowers.length > 0 ? (
        <FilterGroup title="Цветы" hint="несколько">
          {options.flowers.map((item) => (
            <ChipButton
              key={item.id}
              active={draft.flowers.includes(item.slug)}
              onClick={() => toggleFacet('flowers', item.slug)}
            >
              {item.name}
            </ChipButton>
          ))}
        </FilterGroup>
      ) : null}

      {options.occasions.length > 0 ? (
        <FilterGroup title="Повод" hint="несколько">
          {options.occasions.map((item) => (
            <ChipButton
              key={item.id}
              active={draft.occasions.includes(item.slug)}
              onClick={() => toggleFacet('occasions', item.slug)}
            >
              {item.name}
            </ChipButton>
          ))}
        </FilterGroup>
      ) : null}

      {options.recipients.length > 0 ? (
        <FilterGroup title="Кому" hint="несколько">
          {options.recipients.map((item) => (
            <ChipButton
              key={item.id}
              active={draft.recipients.includes(item.slug)}
              onClick={() => toggleFacet('recipients', item.slug)}
            >
              {item.name}
            </ChipButton>
          ))}
        </FilterGroup>
      ) : null}

      {options.styles.length > 0 ? (
        <FilterGroup title="Стиль" hint="несколько">
          {options.styles.map((item) => (
            <ChipButton
              key={item.id}
              active={draft.styles.includes(item.slug)}
              onClick={() => toggleFacet('styles', item.slug)}
            >
              {item.name}
            </ChipButton>
          ))}
        </FilterGroup>
      ) : null}

      {options.categories.length > 0 ? (
        <FilterGroup title="Категория" hint="несколько">
          {options.categories.map((item) => (
            <ChipButton
              key={item.id}
              active={draft.categories.includes(item.slug)}
              onClick={() => toggleFacet('categories', item.slug)}
            >
              {item.name}
            </ChipButton>
          ))}
        </FilterGroup>
      ) : null}
    </div>
  );
}

export type ActiveChip = {
  id: string;
  label: string;
  href: string;
};

export function buildActiveFilterChips(
  state: CatalogSearchState,
  options: CatalogFilterOptions,
): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const nameOf = (list: TaxonomyRefDto[], slug: string) =>
    list.find((item) => item.slug === slug)?.name ?? slug;

  const pushList = (key: FacetKey, slugs: string[], optionsList: TaxonomyRefDto[]) => {
    for (const slug of slugs) {
      chips.push({
        id: `${key}:${slug}`,
        label: nameOf(optionsList, slug),
        href: buildHref(state, { [key]: slugs.filter((item) => item !== slug) }),
      });
    }
  };

  pushList('colors', state.colors, options.colors);
  pushList('flowers', state.flowers, options.flowers);
  pushList('occasions', state.occasions, options.occasions);
  pushList('recipients', state.recipients, options.recipients);
  pushList('styles', state.styles, options.styles);
  pushList('categories', state.categories, options.categories);

  if (state.band) {
    const band = PRICE_BANDS.find((item) => item.id === state.band);
    chips.push({
      id: `band:${state.band}`,
      label: band?.label ?? state.band,
      href: buildHref(state, { band: undefined }),
    });
  } else if (state.minPrice || state.maxPrice) {
    const from = state.minPrice ? `от ${state.minPrice}` : '';
    const to = state.maxPrice ? `до ${state.maxPrice}` : '';
    chips.push({
      id: 'price-custom',
      label: `Цена ${[from, to].filter(Boolean).join(' ')} BYN`.trim(),
      href: buildHref(state, { minPrice: undefined, maxPrice: undefined }),
    });
  }

  if (state.search) {
    chips.push({
      id: 'search',
      label: `«${state.search}»`,
      href: buildHref(state, { search: undefined }),
    });
  }

  return chips;
}

export function CatalogActiveFilters({
  state,
  options,
}: {
  state: CatalogSearchState;
  options: CatalogFilterOptions;
}) {
  const chips = useMemo(() => buildActiveFilterChips(state, options), [state, options]);
  if (chips.length === 0) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Активные фильтры">
      {chips.map((chip) => (
        <Link
          key={chip.id}
          href={chip.href}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-sm text-foreground transition hover:bg-peach"
        >
          <span>{chip.label}</span>
          <span aria-hidden className="text-muted">
            ×
          </span>
          <span className="sr-only">Убрать фильтр</span>
        </Link>
      ))}
      <Link
        href="/bukety"
        className="sf-small ml-1 text-muted underline-offset-2 hover:text-brand hover:underline"
      >
        Сбросить всё
      </Link>
    </div>
  );
}

export function CatalogFilters({ state, options, variant = 'sidebar' }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(state);
  const drawerId = useId();
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const active = catalogHasActiveFilters(state);
  const activeCount = catalogActiveFilterCount(state);

  useEffect(() => {
    setDraft(state);
  }, [state]);

  useEffect(() => {
    if (!open) return;
    setDraft(state);
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
  }, [open, state]);

  const navigate = useCallback(
    (next: CatalogSearchState) => {
      startTransition(() => {
        router.push(buildHref(next, {}));
      });
    },
    [router],
  );

  if (variant === 'sidebar') {
    return (
      <aside className="hidden w-60 shrink-0 lg:block xl:w-64">
        <div className="mb-5 flex items-end justify-between gap-2">
          <p className="sf-h3">Фильтры</p>
          {active ? (
            <Link href="/bukety" className="sf-small text-muted hover:text-brand hover:underline">
              Сбросить
            </Link>
          ) : null}
        </div>
        <FiltersBody
          draft={draft}
          onChange={setDraft}
          onCommit={(next) => {
            setDraft(next);
            navigate(next);
          }}
          options={options}
        />
        {pending ? <p className="sf-small mt-4 text-muted">Обновляем…</p> : null}
      </aside>
    );
  }

  return (
    <div className="lg:hidden">
      <button
        ref={openButtonRef}
        type="button"
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium ${
          active ? 'border-brand bg-brand-soft text-foreground' : 'border-border bg-white'
        }`}
        aria-expanded={open}
        aria-controls={drawerId}
        onClick={() => setOpen(true)}
      >
        Фильтры
        {activeCount > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[0.7rem] font-semibold text-brand-foreground">
            {activeCount}
          </span>
        ) : null}
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
            <FiltersBody draft={draft} onChange={setDraft} options={options} />
          </div>
          <div className="sticky bottom-0 border-t border-border bg-background px-4 py-3">
            <div className="flex gap-3">
              <Link
                href="/bukety"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-border px-4 text-sm font-medium"
                onClick={() => setOpen(false)}
              >
                Сбросить
              </Link>
              <button
                type="button"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-brand px-4 text-sm font-medium text-brand-foreground"
                onClick={() => {
                  navigate(draft);
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
        className="rounded-full border border-border bg-white px-3.5 py-2 text-foreground"
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

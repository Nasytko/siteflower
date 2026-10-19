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
} from 'react';
import type {
  BudgetRangePublicDto,
  FlowerTypeDto,
  TaxonomyRefDto,
} from '@bouquet-one/contracts';
import { trackEvent } from '@/lib/analytics';
import { PriceRangeFilter } from '@/components/storefront/price-range-filter';
import {
  bouquetCountLabel,
  catalogHasActiveFilters,
  catalogHref,
  SORT_OPTIONS,
  toggleSlug,
  type CatalogDimension,
  type CatalogSearchState,
} from '@/lib/catalog-search-params';

export type CatalogFilterOptions = {
  budgets: BudgetRangePublicDto[];
  occasions: TaxonomyRefDto[];
  recipients: TaxonomyRefDto[];
  colors: TaxonomyRefDto[];
  /** FlowerType options for the «Цветы» facet. */
  flowers: Array<Pick<FlowerTypeDto, 'slug' | 'name'> | TaxonomyRefDto>;
};

type Option = { value: string; label: string };

/** One accordion section = one filter dimension. */
type Control = {
  id: string;
  label: string;
  dimension: CatalogDimension;
  options: Option[];
};

function asOptions(items: Array<{ slug: string; name: string }>): Option[] {
  return items.map((item) => ({ value: item.slug, label: item.name }));
}

function buildControls(options: CatalogFilterOptions): Control[] {
  const controls: Control[] = [
    { id: 'color', label: 'Цвет', dimension: 'colors', options: asOptions(options.colors) },
    {
      id: 'flower',
      label: 'Цветы',
      dimension: 'flowers',
      options: asOptions(options.flowers),
    },
    {
      id: 'occasion',
      label: 'Повод',
      dimension: 'occasions',
      options: asOptions(options.occasions),
    },
    {
      id: 'recipient',
      label: 'Кому',
      dimension: 'recipients',
      options: asOptions(options.recipients),
    },
  ];

  return controls.filter((control) => control.options.length > 0);
}

/** Derive slider bounds from admin budget ranges (fallback 0–500 BYN). */
function priceBoundsFromBudgets(budgets: BudgetRangePublicDto[]): {
  boundMinMajor: number;
  boundMaxMajor: number;
} {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const range of budgets) {
    if (range.minMinor && /^\d+$/.test(range.minMinor)) {
      min = Math.min(min, Number(range.minMinor) / 100);
    }
    if (range.maxMinor && /^\d+$/.test(range.maxMinor)) {
      max = Math.max(max, Number(range.maxMinor) / 100);
    }
  }
  if (!Number.isFinite(min) || min === Number.POSITIVE_INFINITY) min = 0;
  if (max <= min) max = Math.max(min + 100, 500);
  return { boundMinMajor: Math.floor(min), boundMaxMajor: Math.ceil(max) };
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
      <path
        d="M3.5 8.4 6.3 11.2 12.5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M4 6.5 8 10.5 12 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OptionRow({
  option,
  checked,
  onToggle,
}: {
  option: Option;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} className="sf-option" onClick={onToggle}>
      <span className="sf-option__box" aria-hidden>
        <CheckIcon />
      </span>
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
    </button>
  );
}

function FilterAccordion({
  control,
  state,
  onApply,
  defaultOpen = false,
}: {
  control: Control;
  state: CatalogSearchState;
  onApply: (next: CatalogSearchState) => void;
  defaultOpen?: boolean;
}) {
  const selected = state[control.dimension];
  const [open, setOpen] = useState(defaultOpen || selected.length > 0);
  const panelId = useId();

  const toggle = (value: string) => {
    trackEvent('select_filter', { key: control.dimension, value });
    onApply({
      ...state,
      [control.dimension]: toggleSlug(selected, value),
      page: 1,
    });
  };

  return (
    <div className="sf-filter-accordion" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="sf-filter-accordion__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{control.label}</span>
          {selected.length > 0 ? (
            <span className="sf-filter-accordion__badge">{selected.length}</span>
          ) : null}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div id={panelId} className="sf-filter-accordion__body" role="group" aria-label={control.label}>
          <div className="max-h-56 overflow-y-auto pr-0.5">
            {control.options.map((option) => (
              <OptionRow
                key={option.value}
                option={option}
                checked={selected.includes(option.value)}
                onToggle={() => toggle(option.value)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FiltersPanelBody({
  controls,
  state,
  onApply,
  clearHref = '/bukety',
  priceBounds,
}: {
  controls: Control[];
  state: CatalogSearchState;
  onApply: (next: CatalogSearchState) => void;
  clearHref?: string;
  priceBounds: { boundMinMajor: number; boundMaxMajor: number };
}) {
  const hasFilters = catalogHasActiveFilters(state);

  return (
    <div>
      <p className="sf-filters-panel__title">Фильтры</p>
      <div className="sf-filter-price-block">
        <PriceRangeFilter
          minMinor={state.minPriceMinor}
          maxMinor={state.maxPriceMinor}
          boundMinMajor={priceBounds.boundMinMajor}
          boundMaxMajor={priceBounds.boundMaxMajor}
          onApply={(next) =>
            onApply({
              ...state,
              minPriceMinor: next.minPriceMinor,
              maxPriceMinor: next.maxPriceMinor,
              budgets: [],
              page: 1,
            })
          }
        />
      </div>
      {controls.map((control, index) => (
        <FilterAccordion
          key={control.id}
          control={control}
          state={state}
          onApply={onApply}
          defaultOpen={index === 0}
        />
      ))}
      {hasFilters ? (
        <Link href={clearHref} className="sf-filter-clear" scroll={false}>
          Очистить фильтры
        </Link>
      ) : null}
    </div>
  );
}

function SortControl({
  state,
  onApply,
}: {
  state: CatalogSearchState;
  onApply: (next: CatalogSearchState) => void;
}) {
  const current = SORT_OPTIONS.find((option) => option.value === state.sort) ?? SORT_OPTIONS[0]!;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="sf-catalog-toolbar__sort relative">
      <span className="sf-catalog-toolbar__sort-label">Сортировать по:</span>
      <button
        ref={triggerRef}
        type="button"
        className="sf-sort-link"
        data-active="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {current.label}
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div
          id={panelId}
          className="sf-popover sf-popover-in sf-popover--right w-56"
          role="radiogroup"
          aria-label="Сортировка"
        >
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={option.value === state.sort}
              className="sf-option"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
                if (option.value !== state.sort) {
                  onApply({ ...state, sort: option.value, page: 1 });
                }
              }}
            >
              <span className="sf-option__box" aria-hidden>
                <CheckIcon />
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  state: CatalogSearchState;
  options: CatalogFilterOptions;
};

/** Sticky sidebar accordion filters for `/bukety`. */
export function CatalogFilters({ state, options }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const controls = useMemo(() => buildControls(options), [options]);
  const priceBounds = useMemo(() => priceBoundsFromBudgets(options.budgets), [options.budgets]);

  const apply = useCallback(
    (next: CatalogSearchState) => {
      startTransition(() => {
        router.push(catalogHref(next), { scroll: false });
      });
    },
    [router],
  );

  return (
    <div data-pending={pending ? 'true' : 'false'}>
      <FiltersPanelBody
        controls={controls}
        state={state}
        onApply={apply}
        priceBounds={priceBounds}
      />
    </div>
  );
}

/** Count + «Сортировать по:» for the main catalog column. */
export function CatalogToolbar({
  state,
  total,
  countLabel,
}: {
  state: CatalogSearchState;
  total: number;
  countLabel?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <div className="sf-catalog-toolbar">
      <p className="sf-catalog-toolbar__count" aria-live="polite">
        {countLabel ?? bouquetCountLabel(total)}
      </p>
      <SortControl
        state={state}
        onApply={(next) => {
          startTransition(() => {
            router.push(catalogHref(next), { scroll: false });
          });
        }}
      />
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

  const push = (
    dimension: CatalogDimension,
    lookup: Array<{ value: string; label: string }>,
  ) => {
    const selected = state[dimension];
    for (const value of selected) {
      chips.push({
        id: `${dimension}:${value}`,
        label: lookup.find((item) => item.value === value)?.label ?? value,
        href: catalogHref(state, {
          [dimension]: selected.filter((item) => item !== value),
        } as Partial<CatalogSearchState>),
      });
    }
  };

  push(
    'budgets',
    options.budgets.map((range) => ({ value: range.id, label: range.label })),
  );
  push('occasions', asOptions(options.occasions));
  push('recipients', asOptions(options.recipients));
  push('colors', asOptions(options.colors));
  push('flowers', asOptions(options.flowers));

  if (state.search) {
    chips.push({
      id: 'search',
      label: `«${state.search}»`,
      href: catalogHref(state, { search: undefined }),
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
    <div className="mb-4 flex flex-wrap items-center gap-2 lg:hidden" aria-label="Выбранные фильтры">
      {chips.map((chip) => (
        <Link key={chip.id} href={chip.href} className="sf-chip" scroll={false}>
          <span>{chip.label}</span>
          <span className="sf-chip__x" aria-hidden>
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

/** Gentle catalog empty state: reset the current query or open the full catalog. */
export function CatalogEmptyState({ state }: { state: CatalogSearchState }) {
  const hasFilters = catalogHasActiveFilters(state);

  return (
    <div className="sf-panel flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="sf-h2">Под такой запрос букетов не нашлось</p>
      <p className="sf-body max-w-md text-muted">
        {hasFilters
          ? 'Попробуйте снять один из фильтров — например, расширить бюджет или убрать цвет.'
          : 'Мы обновляем витрину каждый день. Загляните в полный каталог.'}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {hasFilters ? (
          <Link href="/bukety" className="sf-cta">
            Сбросить фильтры
          </Link>
        ) : null}
        <Link href="/bukety" className="sf-cta-ghost">
          Все букеты
        </Link>
      </div>
    </div>
  );
}

/** Compact pager: Назад · ●1 · Вперед */
export function CatalogPager({
  page,
  totalPages,
  prevHref,
  nextHref,
}: {
  page: number;
  totalPages: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="sf-pager" aria-label="Страницы каталога">
      {prevHref ? (
        <Link href={prevHref} className="sf-pager__nav" rel="prev">
          Назад
        </Link>
      ) : (
        <span className="sf-pager__nav opacity-40" aria-disabled>
          Назад
        </span>
      )}
      <span className="sf-pager__page" data-active="true" aria-current="page">
        {page}
      </span>
      {totalPages > 1 ? (
        <span className="sf-small text-muted">из {totalPages}</span>
      ) : null}
      {nextHref ? (
        <Link href={nextHref} className="sf-pager__nav" rel="next">
          Вперед
        </Link>
      ) : (
        <span className="sf-pager__nav opacity-40" aria-disabled>
          Вперед
        </span>
      )}
    </nav>
  );
}

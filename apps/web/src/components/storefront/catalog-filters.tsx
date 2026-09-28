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
  BouquetSizePublicDto,
  BudgetRangePublicDto,
  TaxonomyRefDto,
} from '@bouquet-one/contracts';
import { trackEvent } from '@/lib/analytics';
import {
  bouquetCountLabel,
  catalogActiveFilterCount,
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
  flowers: TaxonomyRefDto[];
  sizes: BouquetSizePublicDto[];
};

type Option = { value: string; label: string };

/** One visible control; "Повод / Кому" intentionally holds two dimensions. */
type Control = {
  id: string;
  label: string;
  groups: Array<{ dimension: CatalogDimension; heading?: string; options: Option[] }>;
};

function asOptions(items: Array<{ slug: string; name: string }>): Option[] {
  return items.map((item) => ({ value: item.slug, label: item.name }));
}

function buildControls(options: CatalogFilterOptions): Control[] {
  const controls: Control[] = [
    {
      id: 'budget',
      label: 'Бюджет',
      groups: [
        {
          dimension: 'budgets',
          options: options.budgets.map((range) => ({ value: range.id, label: range.label })),
        },
      ],
    },
    {
      id: 'occasion-recipient',
      label: 'Повод / Кому',
      groups: [
        { dimension: 'occasions', heading: 'Повод', options: asOptions(options.occasions) },
        { dimension: 'recipients', heading: 'Кому', options: asOptions(options.recipients) },
      ],
    },
    { id: 'color', label: 'Цвет', groups: [{ dimension: 'colors', options: asOptions(options.colors) }] },
    {
      id: 'flower',
      label: 'Цветок',
      groups: [{ dimension: 'flowers', options: asOptions(options.flowers) }],
    },
    {
      id: 'size',
      label: 'Размер букета',
      groups: [{ dimension: 'sizes', options: asOptions(options.sizes) }],
    },
  ];

  return controls.filter((control) => control.groups.some((group) => group.options.length > 0));
}

function selectedCount(state: CatalogSearchState, control: Control): number {
  return control.groups.reduce((sum, group) => sum + state[group.dimension].length, 0);
}

/** Short, quiet summary next to the pill label: first selection + "+N". */
function selectionSummary(state: CatalogSearchState, control: Control): string | null {
  const labels: string[] = [];
  for (const group of control.groups) {
    for (const value of state[group.dimension]) {
      const option = group.options.find((item) => item.value === value);
      labels.push(option?.label ?? value);
    }
  }
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0]!;
  return `${labels[0]} +${labels.length - 1}`;
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

function OptionGroups({
  control,
  draft,
  onToggle,
}: {
  control: Control;
  draft: CatalogSearchState;
  onToggle: (dimension: CatalogDimension, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {control.groups
        .filter((group) => group.options.length > 0)
        .map((group) => (
          <fieldset key={group.dimension}>
            {group.heading ? (
              <legend className="sf-label mb-1.5">{group.heading}</legend>
            ) : (
              <legend className="sr-only">{control.label}</legend>
            )}
            <div className="max-h-64 overflow-y-auto pr-0.5">
              {group.options.map((option) => (
                <OptionRow
                  key={option.value}
                  option={option}
                  checked={draft[group.dimension].includes(option.value)}
                  onToggle={() => onToggle(group.dimension, option.value)}
                />
              ))}
            </div>
          </fieldset>
        ))}
    </div>
  );
}

/**
 * Desktop filter pill + popover. Multi-select keeps the popover open;
 * Esc / outside click / «Готово» close it and return focus to the trigger.
 */
function FilterPill({
  control,
  state,
  onApply,
}: {
  control: Control;
  state: CatalogSearchState;
  onApply: (next: CatalogSearchState) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const count = selectedCount(state, control);
  const summary = selectionSummary(state, control);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [open, close]);

  const toggle = (dimension: CatalogDimension, value: string) => {
    trackEvent('select_filter', { key: dimension, value });
    onApply({ ...state, [dimension]: toggleSlug(state[dimension], value), page: 1 });
  };

  const clearControl = () => {
    const cleared: Partial<CatalogSearchState> = {};
    for (const group of control.groups) cleared[group.dimension] = [];
    onApply({ ...state, ...cleared, page: 1 });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="sf-filter-pill"
        data-active={count > 0}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="shrink-0">{control.label}</span>
        {summary ? <span className="sf-filter-pill__summary">· {summary}</span> : null}
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div id={panelId} className="sf-popover sf-popover-in" role="group" aria-label={control.label}>
          <OptionGroups control={control} draft={state} onToggle={toggle} />
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
            <button
              type="button"
              className="sf-small text-muted underline-offset-2 hover:text-brand hover:underline disabled:opacity-40"
              disabled={count === 0}
              onClick={clearControl}
            >
              Очистить
            </button>
            <button type="button" className="sf-cta px-5" onClick={() => close()}>
              Готово
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SortControl({
  state,
  onApply,
  align = 'right',
}: {
  state: CatalogSearchState;
  onApply: (next: CatalogSearchState) => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const current = SORT_OPTIONS.find((option) => option.value === state.sort) ?? SORT_OPTIONS[0]!;

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
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="sf-filter-pill"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sr-only">Сортировка: </span>
        <span className="shrink-0 text-muted">Сортировка</span>
        <span className="sf-filter-pill__summary !text-foreground">· {current.label}</span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          id={panelId}
          className={`sf-popover sf-popover-in ${align === 'right' ? 'sf-popover--right' : ''} w-64`}
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

/** Mobile bottom sheet — every dimension as its own section, draft applied on «Показать». */
function FilterSheet({
  controls,
  state,
  total,
  onApply,
}: {
  controls: Control[];
  state: CatalogSearchState;
  total: number;
  onApply: (next: CatalogSearchState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(state);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();
  const activeCount = catalogActiveFilterCount(state);

  useEffect(() => {
    setDraft(state);
  }, [state]);

  useEffect(() => {
    if (!open) return;
    setDraft(state);
    closeRef.current?.focus();
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

  const draftCount = catalogActiveFilterCount(draft);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sf-filter-pill w-full justify-between"
        data-active={activeCount > 0}
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => setOpen(true)}
      >
        <span className="font-semibold">Фильтры</span>
        <span className="flex items-center gap-2">
          {activeCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[0.7rem] font-semibold text-brand-foreground">
              {activeCount}
            </span>
          ) : null}
          <ChevronIcon open={false} />
        </span>
      </button>

      {open ? (
        <div className="sf-sheet" id={sheetId}>
          <button
            type="button"
            className="sf-sheet__backdrop"
            aria-label="Закрыть фильтры"
            onClick={() => setOpen(false)}
          />
          <div className="sf-sheet__panel" role="dialog" aria-modal="true" aria-label="Фильтры каталога">
            <div className="sf-sheet__header flex items-center justify-between gap-3">
              <div>
                <p className="sf-h3">Фильтры</p>
                <p className="sf-small text-muted">
                  {draftCount > 0 ? `Выбрано: ${draftCount}` : 'Ничего не выбрано'}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-brand-soft"
                aria-label="Закрыть фильтры"
                onClick={() => setOpen(false)}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <path d="M6 6 18 18M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="sf-sheet__body">
              {controls.map((control) => (
                <section key={control.id} className="border-b border-border py-4 last:border-b-0">
                  <p className="sf-h3 mb-2">{control.label}</p>
                  <OptionGroups
                    control={control}
                    draft={draft}
                    onToggle={(dimension, value) =>
                      setDraft((current) => ({
                        ...current,
                        [dimension]: toggleSlug(current[dimension], value),
                        page: 1,
                      }))
                    }
                  />
                </section>
              ))}
            </div>

            <div className="sf-sheet__footer flex items-center gap-3">
              <button
                type="button"
                className="sf-cta-ghost flex-1"
                onClick={() => {
                  setDraft({ ...draft, budgets: [], occasions: [], recipients: [], colors: [], flowers: [], sizes: [] });
                }}
              >
                Сбросить
              </button>
              <button
                type="button"
                className="sf-cta flex-[1.4]"
                onClick={() => {
                  onApply({ ...draft, page: 1 });
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                Показать {bouquetCountLabel(total)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type Props = {
  state: CatalogSearchState;
  options: CatalogFilterOptions;
  /** Applied result count — powers «Показать N букетов» on mobile. */
  total: number;
};

/**
 * Horizontal pill row (desktop) / single «Фильтры» sheet trigger (mobile).
 * Deliberately never squeezes five pills into a 390px row.
 */
export function CatalogFilters({ state, options, total }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const controls = useMemo(() => buildControls(options), [options]);

  const apply = useCallback(
    (next: CatalogSearchState) => {
      startTransition(() => {
        router.push(catalogHref(next), { scroll: false });
      });
    },
    [router],
  );

  if (controls.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="sf-small text-muted" aria-live="polite">
          Найдено {bouquetCountLabel(total)}
        </p>
        <SortControl state={state} onApply={apply} />
      </div>
    );
  }

  return (
    <div data-pending={pending ? 'true' : 'false'}>
      {/* Mobile: one trigger + sort */}
      <div className="flex flex-col gap-2 lg:hidden">
        <FilterSheet controls={controls} state={state} total={total} onApply={apply} />
        <div className="flex items-center justify-between gap-3">
          <p className="sf-small text-muted" aria-live="polite">
            Найдено {bouquetCountLabel(total)}
          </p>
          <SortControl state={state} onApply={apply} />
        </div>
      </div>

      {/* Desktop: pill row + sort on the right */}
      <div className="hidden lg:block">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {controls.map((control) => (
              <FilterPill key={control.id} control={control} state={state} onApply={apply} />
            ))}
          </div>
          <div className="ml-auto">
            <SortControl state={state} onApply={apply} />
          </div>
        </div>
        <p className="sf-small mt-3 text-muted" aria-live="polite">
          Найдено {bouquetCountLabel(total)}
        </p>
      </div>
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
  push('sizes', asOptions(options.sizes));

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
    <div className="flex flex-wrap items-center gap-2" aria-label="Выбранные фильтры">
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

/** Kept for callers that want a bare sort control (e.g. taxonomy landings). */
export function CatalogSortSelect({ state }: { state: CatalogSearchState }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <SortControl
      state={state}
      onApply={(next) => {
        startTransition(() => {
          router.push(catalogHref(next), { scroll: false });
        });
      }}
    />
  );
}
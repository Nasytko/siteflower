'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type ReactNode } from 'react';
import type {
  CatalogCategoryFilterPublicDto,
  CatalogFilterKey,
  CatalogListingKind,
  CompositionKind,
} from '@bouquet-one/contracts';
import {
  catalogCountLabel,
  katalogHasActiveFilters,
  katalogHref,
  toggleSlug,
  type KatalogSearchState,
} from '@/lib/katalog-search-params';
import { SORT_OPTIONS } from '@/lib/catalog-search-params';
import { PriceRangeFilter } from '@/components/storefront/price-range-filter';

type Props = {
  categorySlug: string;
  state: KatalogSearchState;
  total: number;
  filters: CatalogCategoryFilterPublicDto[];
  listingKind?: CatalogListingKind | null;
  hideToolbar?: boolean;
  /** Price slider bounds in BYN (major). */
  priceBoundMin?: number;
  priceBoundMax?: number;
};

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

function slugListForKey(key: CatalogFilterKey, state: KatalogSearchState): string[] {
  switch (key) {
    case 'flower_type':
      return state.flowerTypes;
    case 'variety':
      return state.varieties;
    case 'color':
      return state.colors;
    case 'origin':
      return state.origins;
    case 'occasion':
      return state.occasions;
    case 'recipient':
      return state.recipients;
    case 'composition_kind':
      return state.compositionKinds.map((k) =>
        k === 'MONO' ? 'mono' : k === 'MIXED' ? 'mixed' : 'unknown',
      );
    default:
      return [];
  }
}

function patchForKey(
  key: CatalogFilterKey,
  state: KatalogSearchState,
  slug: string,
): Partial<KatalogSearchState> {
  switch (key) {
    case 'flower_type':
      return { flowerTypes: toggleSlug(state.flowerTypes, slug) };
    case 'variety':
      return { varieties: toggleSlug(state.varieties, slug) };
    case 'color':
      return { colors: toggleSlug(state.colors, slug) };
    case 'origin':
      return { origins: toggleSlug(state.origins, slug) };
    case 'occasion':
      return { occasions: toggleSlug(state.occasions, slug) };
    case 'recipient':
      return { recipients: toggleSlug(state.recipients, slug) };
    case 'composition_kind': {
      const kind: CompositionKind | null =
        slug === 'mono' || slug === 'MONO'
          ? 'MONO'
          : slug === 'mixed' || slug === 'MIXED'
            ? 'MIXED'
            : null;
      if (!kind) return {};
      const next: CompositionKind[] = state.compositionKinds.includes(kind)
        ? state.compositionKinds.filter((item) => item !== kind)
        : [...state.compositionKinds, kind];
      return { compositionKinds: next };
    }
    case 'stem_height':
      return { height: state.height === slug ? null : (slug as KatalogSearchState['height']) };
    case 'promo':
      return { promo: !state.promo };
    case 'quantity': {
      const qty = Number(slug);
      if (!Number.isFinite(qty) || qty < 1) return {};
      return { minQty: state.minQty === qty ? undefined : qty };
    }
    default:
      return {};
  }
}

function AccordionSection({
  label,
  count,
  defaultOpen,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen) || count > 0);
  const panelId = useId();

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
          <span className="truncate">{label}</span>
          {count > 0 ? <span className="sf-filter-accordion__badge">{count}</span> : null}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div id={panelId} className="sf-filter-accordion__body">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function OptionLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="sf-option"
      role="checkbox"
      aria-checked={active}
      scroll={false}
    >
      <span className="sf-option__box" aria-hidden>
        <CheckIcon />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

/**
 * Left sidebar: price slider → promo checkbox → accordion facets → clear.
 */
export function KatalogFiltersPanel({
  categorySlug,
  state,
  total,
  filters,
  listingKind = null,
  hideToolbar = false,
  priceBoundMin = 0,
  priceBoundMax = 500,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const hasFilters = katalogHasActiveFilters(state);
  const clearHref = `/katalog/${encodeURIComponent(categorySlug)}`;

  const promoFilter = filters.find((f) => f.key === 'promo');
  const facetFilters = filters.filter((f) => f.key !== 'price' && f.key !== 'promo');
  /** Price slider is always shown — not gated by Filter Pool. */
  const showPrice = true;

  const applyPrice = (next: { minPriceMinor?: string; maxPriceMinor?: string }) => {
    startTransition(() => {
      router.push(katalogHref(categorySlug, state, next), { scroll: false });
    });
  };

  return (
    <div>
      {hideToolbar ? null : (
        <div className="sf-catalog-toolbar">
          <p className="sf-catalog-toolbar__count">{catalogCountLabel(total, listingKind)}</p>
          <div className="sf-catalog-toolbar__sort">
            <span className="sf-catalog-toolbar__sort-label">Сортировать по:</span>
            {SORT_OPTIONS.map((option) => (
              <Link
                key={option.value}
                href={katalogHref(categorySlug, state, { sort: option.value })}
                className="sf-sort-link"
                data-active={state.sort === option.value ? 'true' : 'false'}
                scroll={false}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="sf-filters-panel__title">Фильтры</p>

      {showPrice ? (
        <div className="sf-filter-price-block">
          <PriceRangeFilter
            minMinor={state.minPriceMinor}
            maxMinor={state.maxPriceMinor}
            boundMinMajor={priceBoundMin}
            boundMaxMajor={priceBoundMax}
            onApply={applyPrice}
          />
        </div>
      ) : null}

      {promoFilter ? (
        <Link
          href={katalogHref(categorySlug, state, { promo: !state.promo })}
          className="sf-option sf-option--promo"
          role="checkbox"
          aria-checked={state.promo}
          scroll={false}
        >
          <span className="sf-option__box" aria-hidden>
            <CheckIcon />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{promoFilter.label}</span>
        </Link>
      ) : null}

      {facetFilters.map((filter, index) => {
        if (filter.key === 'stem_height') {
          return (
            <AccordionSection
              key={filter.key}
              label={filter.label}
              count={state.height ? 1 : 0}
              defaultOpen={index === 0}
            >
              <div className="max-h-56 overflow-y-auto pr-0.5">
                {filter.options.map((option) => (
                  <OptionLink
                    key={option.slug}
                    label={option.name}
                    active={state.height === option.slug}
                    href={katalogHref(categorySlug, state, patchForKey(filter.key, state, option.slug))}
                  />
                ))}
              </div>
            </AccordionSection>
          );
        }

        if (filter.key === 'quantity') {
          return (
            <AccordionSection
              key={filter.key}
              label={filter.label}
              count={state.minQty ? 1 : 0}
              defaultOpen={index === 0}
            >
              <div className="max-h-56 overflow-y-auto pr-0.5">
                {filter.options.map((option) => (
                  <OptionLink
                    key={option.slug}
                    label={`от ${option.name}`}
                    active={state.minQty === Number(option.slug)}
                    href={katalogHref(categorySlug, state, patchForKey(filter.key, state, option.slug))}
                  />
                ))}
              </div>
            </AccordionSection>
          );
        }

        const selected = slugListForKey(filter.key, state);
        if (filter.options.length === 0) return null;

        return (
          <AccordionSection
            key={filter.key}
            label={filter.label}
            count={selected.length}
            defaultOpen={index === 0}
          >
            <div className="max-h-56 overflow-y-auto pr-0.5">
              {filter.options.map((option) => (
                <OptionLink
                  key={option.slug}
                  label={option.name}
                  active={selected.includes(option.slug)}
                  href={katalogHref(categorySlug, state, patchForKey(filter.key, state, option.slug))}
                />
              ))}
            </div>
          </AccordionSection>
        );
      })}

      {hasFilters ? (
        <Link href={clearHref} className="sf-filter-clear" scroll={false}>
          Очистить фильтры
        </Link>
      ) : null}
    </div>
  );
}

/** Main-column toolbar: count + sort links. */
export function KatalogToolbar({
  categorySlug,
  state,
  total,
  listingKind = null,
}: {
  categorySlug: string;
  state: KatalogSearchState;
  total: number;
  listingKind?: CatalogListingKind | null;
}) {
  return (
    <div className="sf-catalog-toolbar">
      <p className="sf-catalog-toolbar__count">{catalogCountLabel(total, listingKind)}</p>
      <div className="sf-catalog-toolbar__sort">
        <span className="sf-catalog-toolbar__sort-label">Сортировать по:</span>
        {SORT_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={katalogHref(categorySlug, state, { sort: option.value })}
            className="sf-sort-link"
            data-active={state.sort === option.value ? 'true' : 'false'}
            scroll={false}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

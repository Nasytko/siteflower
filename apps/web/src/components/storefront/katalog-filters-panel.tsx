import Link from 'next/link';
import type { CatalogCategoryFilterPublicDto, CatalogFilterKey } from '@bouquet-one/contracts';
import {
  bouquetCountLabel,
  katalogHasActiveFilters,
  katalogHref,
  toggleSlug,
  type KatalogSearchState,
} from '@/lib/katalog-search-params';
import { SORT_OPTIONS } from '@/lib/catalog-search-params';

type Props = {
  categorySlug: string;
  state: KatalogSearchState;
  total: number;
  filters: CatalogCategoryFilterPublicDto[];
};

function FilterChip({
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
      className="sf-filter-pill text-sm"
      data-active={active ? 'true' : 'false'}
      aria-pressed={active}
    >
      {label}
    </Link>
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
    case 'bouquet_size':
      return state.sizes;
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
    case 'bouquet_size':
      return { sizes: toggleSlug(state.sizes, slug) };
    case 'stem_height':
      return { height: state.height === slug ? null : (slug as KatalogSearchState['height']) };
    case 'promo':
      return { promo: !state.promo };
    default:
      return {};
  }
}

/**
 * Runtime filter strip driven by CatalogCategoryFilter + contextual options.
 * Unknown / disabled filter keys from the URL are ignored by the panel.
 */
export function KatalogFiltersPanel({ categorySlug, state, total, filters }: Props) {
  const hasFilters = katalogHasActiveFilters(state);
  const enabledKeys = new Set(filters.map((row) => row.key));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="sf-small text-muted">{bouquetCountLabel(total)}</p>
        <div className="flex flex-wrap gap-1.5">
          {SORT_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={katalogHref(categorySlug, state, { sort: option.value })}
              className="sf-filter-pill text-xs"
              data-active={state.sort === option.value ? 'true' : 'false'}
              aria-pressed={state.sort === option.value}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      {filters.map((filter) => {
        if (filter.key === 'promo') {
          return (
            <fieldset key={filter.key}>
              <legend className="sf-label mb-2">{filter.label}</legend>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  label={state.promo ? 'Только акции' : 'Все товары'}
                  active={state.promo}
                  href={katalogHref(categorySlug, state, { promo: !state.promo })}
                />
              </div>
            </fieldset>
          );
        }

        if (filter.key === 'stem_height') {
          return (
            <fieldset key={filter.key}>
              <legend className="sf-label mb-2">{filter.label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {filter.options.map((option) => (
                  <FilterChip
                    key={option.slug}
                    label={option.name}
                    active={state.height === option.slug}
                    href={katalogHref(categorySlug, state, patchForKey(filter.key, state, option.slug))}
                  />
                ))}
              </div>
            </fieldset>
          );
        }

        const selected = slugListForKey(filter.key, state);
        if (filter.options.length === 0) return null;
        return (
          <fieldset key={filter.key}>
            <legend className="sf-label mb-2">{filter.label}</legend>
            <div className="flex flex-wrap gap-1.5">
              {filter.options.map((option) => (
                <FilterChip
                  key={option.slug}
                  label={option.name}
                  active={selected.includes(option.slug)}
                  href={katalogHref(categorySlug, state, patchForKey(filter.key, state, option.slug))}
                />
              ))}
            </div>
          </fieldset>
        );
      })}

      {hasFilters ? (
        <Link href={`/katalog/${encodeURIComponent(categorySlug)}`} className="sf-cta-ghost text-sm">
          Сбросить фильтры
          {enabledKeys.size === 0 ? '' : ''}
        </Link>
      ) : null}
    </div>
  );
}

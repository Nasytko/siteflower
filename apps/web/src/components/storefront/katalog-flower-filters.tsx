import Link from 'next/link';
import { HEIGHT_BANDS, type FlowerOriginDto, type FlowerVarietyDto, type TaxonomyRefDto } from '@bouquet-one/contracts';
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
  varieties: FlowerVarietyDto[];
  colors: TaxonomyRefDto[];
  origins: FlowerOriginDto[];
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

export function KatalogFlowerFilters({
  categorySlug,
  state,
  total,
  varieties,
  colors,
  origins,
}: Props) {
  const hasFilters = katalogHasActiveFilters(state);

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

      {varieties.length > 0 ? (
        <fieldset>
          <legend className="sf-label mb-2">Сорт</legend>
          <div className="flex flex-wrap gap-1.5">
            {varieties.map((item) => (
              <FilterChip
                key={item.slug}
                label={item.name}
                active={state.varieties.includes(item.slug)}
                href={katalogHref(categorySlug, state, {
                  varieties: toggleSlug(state.varieties, item.slug),
                })}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {colors.length > 0 ? (
        <fieldset>
          <legend className="sf-label mb-2">Цвет</legend>
          <div className="flex flex-wrap gap-1.5">
            {colors.map((item) => (
              <FilterChip
                key={item.slug}
                label={item.name}
                active={state.colors.includes(item.slug)}
                href={katalogHref(categorySlug, state, {
                  colors: toggleSlug(state.colors, item.slug),
                })}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="sf-label mb-2">Высота</legend>
        <div className="flex flex-wrap gap-1.5">
          {HEIGHT_BANDS.map((band) => (
            <FilterChip
              key={band.id}
              label={band.label}
              active={state.height === band.id}
              href={katalogHref(categorySlug, state, {
                height: state.height === band.id ? null : band.id,
              })}
            />
          ))}
        </div>
      </fieldset>

      {origins.length > 0 ? (
        <fieldset>
          <legend className="sf-label mb-2">Происхождение</legend>
          <div className="flex flex-wrap gap-1.5">
            {origins.map((item) => (
              <FilterChip
                key={item.slug}
                label={item.name}
                active={state.origins.includes(item.slug)}
                href={katalogHref(categorySlug, state, {
                  origins: toggleSlug(state.origins, item.slug),
                })}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {hasFilters ? (
        <Link href={`/katalog/${encodeURIComponent(categorySlug)}`} className="sf-cta-ghost text-sm">
          Сбросить фильтры
        </Link>
      ) : null}
    </div>
  );
}

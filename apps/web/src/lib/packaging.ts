import type { TaxonomyRefDto } from '@bouquet-one/contracts';

export type PackagingKind = 'wrap' | 'box' | 'none';

export type PackagingOption = {
  kind: PackagingKind;
  label: string;
};

/**
 * Category-derived merchandising badge only (not a customer-selectable order option).
 * Packaging is not part of the order snapshot / checkout API.
 */
export function packagingFromCategories(
  categories: Array<Pick<TaxonomyRefDto, 'slug'>> | undefined | null,
): PackagingOption {
  if (categories?.some((c) => c.slug === 'kompozitsii')) {
    return { kind: 'box', label: 'В коробке' };
  }
  if (categories?.some((c) => c.slug === 'bukety')) {
    return { kind: 'wrap', label: 'В упаковке' };
  }
  return { kind: 'none', label: 'Без упаковки' };
}

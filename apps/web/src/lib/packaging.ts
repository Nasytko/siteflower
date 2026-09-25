import type { TaxonomyRefDto } from '@bouquet-one/contracts';

export type PackagingKind = 'wrap' | 'box' | 'none';

export type PackagingOption = {
  kind: PackagingKind;
  label: string;
};

/** Infer packaging presentation from catalog categories (no schema change). */
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

/** Options shown on PDP — box is fixed; wrap allows “without wrap”. */
export function packagingChoicesFor(
  categories: Array<Pick<TaxonomyRefDto, 'slug'>> | undefined | null,
): PackagingOption[] {
  const base = packagingFromCategories(categories);
  if (base.kind === 'box') {
    return [base];
  }
  return [
    { kind: 'wrap', label: 'В упаковке' },
    { kind: 'none', label: 'Без упаковки' },
  ];
}

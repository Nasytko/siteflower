import {
  resolveCategoryListingScope,
  type CatalogListingKind,
  type CompositionKind,
  type ProductKind,
} from '@bouquet-one/contracts';
import type { ProductListFilters } from './products.repository';
import type { CatalogMatchService, CatalogMatchResult } from './catalog-match.service';

/** Minimal category shape needed to resolve listing filters. */
export type ListingCategoryInput = {
  id: string;
  slug: string;
  parentId: string | null;
  listingKind: CatalogListingKind | null | undefined;
  pageKind?: string | null;
  rules?: Record<string, unknown> | null;
};

export type ResolvedCategoryListing = {
  /** Category-tree membership (gift subtypes / merchandising). */
  catalogCategoryIds?: string[];
  /** Hub / leaf kind scope (AND with page rules). */
  productKinds?: ProductKind[];
  scopeCompositionKinds?: CompositionKind[];
  /** Resolved page membership rules (ID-preferring). */
  pageRules?: ProductListFilters;
  match?: CatalogMatchResult;
  excludeProductIds?: string[];
};

type ExpandIds = (
  rootId: string,
  options?: { visibleOnly?: boolean },
) => Promise<string[]>;

type LoadExcludes = (pageId: string) => Promise<string[]>;

/**
 * Single orchestrator for public + admin category listing.
 * Combines resolveCategoryListingScope with CatalogMatchService — no second engine.
 */
export async function resolveCategoryListingFilters(params: {
  category: ListingCategoryInput;
  catalogMatch: CatalogMatchService;
  expandCategoryIds: ExpandIds;
  loadExcludeProductIds?: LoadExcludes;
  /** Public storefront only expands VISIBLE descendants. */
  visibleOnly?: boolean;
}): Promise<ResolvedCategoryListing> {
  const { category, catalogMatch } = params;
  const scope = resolveCategoryListingScope(category);
  const out: ResolvedCategoryListing = {
    productKinds: scope.productKinds,
    scopeCompositionKinds: scope.scopeCompositionKinds,
  };

  if (scope.useCategoryTree) {
    out.catalogCategoryIds = await params.expandCategoryIds(category.id, {
      visibleOnly: params.visibleOnly,
    });
  }

  const hasThematicRules =
    category.pageKind === 'THEMATIC' &&
    category.rules &&
    typeof category.rules === 'object' &&
    Object.keys(category.rules).length > 0;

  if (hasThematicRules) {
    const match = await catalogMatch.resolveRulesToFilters(category.rules);
    out.pageRules = match.filters;
    out.match = match;
    if (params.loadExcludeProductIds) {
      out.excludeProductIds = await params.loadExcludeProductIds(category.id);
    }
  } else if (scope.resolveFlowerTypeFromPageSlug) {
    const match = await catalogMatch.resolveFlowerLeafFromPageSlug(category.slug);
    out.pageRules = match.filters;
    out.match = match;
  } else if (scope.scopeCompositionKinds?.length) {
    // e.g. monobukety without thematic rules — composition scope only.
    out.pageRules = {
      productKinds: scope.productKinds,
      compositionKinds: scope.scopeCompositionKinds,
    };
  }

  return out;
}

/** Merge resolved listing into ProductListFilters for repository.list. */
export function mergeListingIntoFilters(
  listing: ResolvedCategoryListing,
  base: ProductListFilters = {},
): ProductListFilters {
  const pageRules = listing.pageRules ?? {};
  const ruleProductKinds = listing.productKinds ?? pageRules.productKinds;
  const ruleCompositionKinds =
    listing.scopeCompositionKinds ?? pageRules.compositionKinds;

  const ruleFlowerTypeIds = [
    ...new Set([
      ...(base.flowerTypeIds ?? []),
      ...(pageRules.flowerTypeIds ?? []),
    ]),
  ];
  const ruleFlowerSlugs = [
    ...new Set([
      ...(base.flowerTypeSlugs ?? []),
      ...(pageRules.flowerTypeSlugs ?? []),
    ]),
  ];

  return {
    ...base,
    ...pageRules,
    catalogCategoryIds: listing.catalogCategoryIds ?? base.catalogCategoryIds,
    productKinds: ruleProductKinds ?? base.productKinds,
    compositionKinds: ruleCompositionKinds ?? base.compositionKinds,
    flowerTypeIds: ruleFlowerTypeIds.length > 0 ? ruleFlowerTypeIds : undefined,
    flowerTypeSlugs:
      ruleFlowerTypeIds.length > 0
        ? undefined
        : ruleFlowerSlugs.length > 0
          ? ruleFlowerSlugs
          : undefined,
    excludeProductIds: listing.excludeProductIds ?? base.excludeProductIds,
    includeProductIds: pageRules.includeProductIds ?? base.includeProductIds,
  };
}

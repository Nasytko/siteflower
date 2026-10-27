import { Injectable } from '@nestjs/common';
import {
  buildTaxonomySlugIndex,
  CATALOG_RULES_EMPTY_MATCH_ID,
  FLOWER_TYPE_SLUG_ALIASES,
  migrateCatalogPageRulesJson,
  resolveCatalogPageRules,
  type CatalogPageRulesResolution,
  type CatalogRulesDiagnostic,
  type CatalogTaxonomyLookup,
  type ResolvedCatalogPageFilters,
} from '@bouquet-one/contracts';
import { PrismaService } from '../database/prisma.service';
import type { ProductListFilters } from './products.repository';

export type CatalogMatchResult = {
  filters: ProductListFilters;
  diagnostics: CatalogRulesDiagnostic[];
  blocking: boolean;
};

/**
 * Single catalog match path for public listing, admin preview, and placement.
 * Resolves CatalogCategory.rules (and SEO landing rules) to ProductListFilters
 * with stable taxonomy IDs; fail-closed on ambiguous/unknown slugs.
 */
@Injectable()
export class CatalogMatchService {
  private lookupCache: { at: number; lookup: CatalogTaxonomyLookup } | null = null;
  private static readonly LOOKUP_TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  async getLookup(force = false): Promise<CatalogTaxonomyLookup> {
    const now = Date.now();
    if (
      !force &&
      this.lookupCache &&
      now - this.lookupCache.at < CatalogMatchService.LOOKUP_TTL_MS
    ) {
      return this.lookupCache.lookup;
    }
    const [flowerTypes, flowerForms, flowerVarieties, colors, occasions, recipients] =
      await Promise.all([
        this.prisma.client.flowerType.findMany({ select: { id: true, slug: true } }),
        this.prisma.client.flowerForm.findMany({ select: { id: true, slug: true } }),
        this.prisma.client.flowerVariety.findMany({ select: { id: true, slug: true } }),
        this.prisma.client.color.findMany({ select: { id: true, slug: true } }),
        this.prisma.client.occasion.findMany({ select: { id: true, slug: true } }),
        this.prisma.client.recipient.findMany({ select: { id: true, slug: true } }),
      ]);
    const lookup: CatalogTaxonomyLookup = {
      flowerTypes: buildTaxonomySlugIndex(flowerTypes),
      flowerForms: buildTaxonomySlugIndex(flowerForms),
      flowerVarieties: buildTaxonomySlugIndex(flowerVarieties),
      colors: buildTaxonomySlugIndex(colors),
      occasions: buildTaxonomySlugIndex(occasions),
      recipients: buildTaxonomySlugIndex(recipients),
      flowerTypeAliases: FLOWER_TYPE_SLUG_ALIASES,
    };
    this.lookupCache = { at: now, lookup };
    return lookup;
  }

  invalidateLookupCache(): void {
    this.lookupCache = null;
  }

  /**
   * Resolve raw page/landing rules into list filters (ID-preferring).
   * When blocking, returns an empty-match filter so callers cannot widen results.
   */
  async resolveRulesToFilters(
    rules: unknown,
    options?: { lookup?: CatalogTaxonomyLookup },
  ): Promise<CatalogMatchResult> {
    const lookup = options?.lookup ?? (await this.getLookup());
    const resolution = resolveCatalogPageRules(rules, lookup);
    return this.toMatchResult(resolution);
  }

  /**
   * STEM flower leaf without stored rules: resolve page URL slug via aliases
   * (rozy → FlowerType roza), never treat the page slug as the dictionary id.
   */
  async resolveFlowerLeafFromPageSlug(
    pageSlug: string,
    options?: { lookup?: CatalogTaxonomyLookup },
  ): Promise<CatalogMatchResult> {
    return this.resolveRulesToFilters(
      {
        productKinds: ['STEM'],
        flowerTypeSlugs: [pageSlug],
      },
      options,
    );
  }

  async migrateRulesJson(
    rules: unknown,
    options?: { lookup?: CatalogTaxonomyLookup },
  ): Promise<{
    next: Record<string, unknown>;
    changed: boolean;
    diagnostics: CatalogRulesDiagnostic[];
  }> {
    const lookup = options?.lookup ?? (await this.getLookup());
    return migrateCatalogPageRulesJson(rules, lookup);
  }

  /**
   * Preview unsaved rules against the live catalog (same engine as public PLP).
   */
  async previewRulesFilters(
    rules: unknown,
    options?: {
      pinnedProductIds?: string[];
      excludedProductIds?: string[];
    },
  ): Promise<CatalogMatchResult & { excludeProductIds: string[] }> {
    const match = await this.resolveRulesToFilters(rules);
    const pinned = [...new Set(options?.pinnedProductIds ?? [])];
    const excluded = [...new Set(options?.excludedProductIds ?? [])];
    const excludeProductIds = [...new Set([...excluded, ...pinned])];
    return { ...match, excludeProductIds };
  }

  private toMatchResult(resolution: CatalogPageRulesResolution): CatalogMatchResult {
    if (resolution.blocking) {
      return {
        filters: { includeProductIds: [CATALOG_RULES_EMPTY_MATCH_ID] },
        diagnostics: resolution.diagnostics,
        blocking: true,
      };
    }
    return {
      filters: toProductListFilters(resolution.filters),
      diagnostics: resolution.diagnostics,
      blocking: false,
    };
  }
}

export function toProductListFilters(
  resolved: ResolvedCatalogPageFilters,
): ProductListFilters {
  const filters: ProductListFilters = {};
  if (resolved.productKinds) filters.productKinds = resolved.productKinds;
  if (resolved.compositionKinds) filters.compositionKinds = resolved.compositionKinds;
  if (resolved.flowerTypeIds) filters.flowerTypeIds = resolved.flowerTypeIds;
  if (resolved.flowerTypeSlugs) filters.flowerTypeSlugs = resolved.flowerTypeSlugs;
  if (resolved.onlyFlowerTypeIds) filters.onlyFlowerTypeIds = resolved.onlyFlowerTypeIds;
  if (resolved.onlyFlowerTypeSlugs) {
    filters.onlyFlowerTypeSlugs = resolved.onlyFlowerTypeSlugs;
  }
  if (resolved.flowerFormIds) filters.flowerFormIds = resolved.flowerFormIds;
  if (resolved.flowerFormSlugs) filters.flowerFormSlugs = resolved.flowerFormSlugs;
  if (resolved.flowerVarietyIds) filters.flowerVarietyIds = resolved.flowerVarietyIds;
  if (resolved.flowerVarietySlugs) {
    filters.flowerVarietySlugs = resolved.flowerVarietySlugs;
  }
  if (resolved.colorIds) filters.colorIds = resolved.colorIds;
  if (resolved.colorSlugs) filters.colorSlugs = resolved.colorSlugs;
  if (resolved.componentColorIds) filters.componentColorIds = resolved.componentColorIds;
  if (resolved.componentColorSlugs) {
    filters.componentColorSlugs = resolved.componentColorSlugs;
  }
  if (resolved.occasionIds) filters.occasionIds = resolved.occasionIds;
  if (resolved.occasionSlugs) filters.occasionSlugs = resolved.occasionSlugs;
  if (resolved.recipientIds) filters.recipientIds = resolved.recipientIds;
  if (resolved.recipientSlugs) filters.recipientSlugs = resolved.recipientSlugs;
  if (resolved.minPriceMinor) filters.minPriceMinor = resolved.minPriceMinor;
  if (resolved.maxPriceMinor) filters.maxPriceMinor = resolved.maxPriceMinor;
  if (resolved.minFlowerTypeQuantity != null && resolved.flowerTypeQuantitySlug) {
    filters.minFlowerTypeQuantity = resolved.minFlowerTypeQuantity;
    filters.flowerTypeQuantitySlug = resolved.flowerTypeQuantitySlug;
  }
  if (resolved.dominantFlowerTypeSlug) {
    filters.dominantFlowerTypeSlug = resolved.dominantFlowerTypeSlug;
  }
  if (resolved.traitKeys) filters.traitKeys = resolved.traitKeys;
  return filters;
}

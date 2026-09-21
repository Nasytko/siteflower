/**
 * Catalog helpers: publication, slugs, rules, publish validation.
 */
import {
  derivePriceRange,
  type CollectionRulesDto,
  type CommercialAvailability,
  type PublishValidationIssue,
} from '@bouquet-one/contracts';

/** Shown to admins when an optimistic-concurrency check fails. */
export const OCC_CONFLICT_MESSAGE =
  'This item was changed by another user. Reload before saving.';

export function isEffectivelyPublished(product: {
  lifecycle: string;
  publishAt: Date | null;
  publishedAt: Date | null;
  unpublishAt: Date | null;
}, now = new Date()): boolean {
  if (product.lifecycle !== 'PUBLISHED') return false;
  const start = product.publishAt ?? product.publishedAt;
  if (start && start.getTime() > now.getTime()) return false;
  if (product.unpublishAt && product.unpublishAt.getTime() <= now.getTime()) return false;
  return true;
}

export function validatePublishRequirements(input: {
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  variants: Array<{ status: string; priceMinor: bigint }>;
  hasPrimaryImage: boolean;
}): PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];
  if (!input.name.trim()) {
    issues.push({ code: 'NAME_REQUIRED', message: 'Name is required', field: 'name' });
  }
  if (!input.slug.trim() || input.slug.length < 2) {
    issues.push({ code: 'SLUG_REQUIRED', message: 'Valid slug is required', field: 'slug' });
  }
  if (!input.shortDescription?.trim()) {
    issues.push({
      code: 'SHORT_DESCRIPTION_REQUIRED',
      message: 'Short description is required to publish',
      field: 'shortDescription',
    });
  }
  if (!input.description?.trim()) {
    issues.push({
      code: 'DESCRIPTION_REQUIRED',
      message: 'Description is required to publish',
      field: 'description',
    });
  }
  const active = input.variants.filter((v) => v.status === 'ACTIVE');
  if (active.length === 0) {
    issues.push({
      code: 'VARIANT_REQUIRED',
      message: 'At least one active variant is required',
      field: 'variants',
    });
  } else if (active.some((v) => v.priceMinor < 0n)) {
    issues.push({
      code: 'INVALID_PRICE',
      message: 'Variant prices must be >= 0',
      field: 'variants',
    });
  }
  if (!input.hasPrimaryImage) {
    issues.push({
      code: 'PRIMARY_IMAGE_REQUIRED',
      message: 'Primary image is required to publish',
      field: 'media',
    });
  }
  return issues;
}

export function wouldCreateRedirectLoop(
  existing: Array<{ fromSlug: string; toSlug: string }>,
  fromSlug: string,
  toSlug: string,
): boolean {
  if (fromSlug === toSlug) return true;
  const map = new Map(existing.map((r) => [r.fromSlug, r.toSlug]));
  map.set(fromSlug, toSlug);
  let current = toSlug;
  const seen = new Set<string>([fromSlug]);
  while (map.has(current)) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = map.get(current)!;
    if (seen.size > 50) return true;
  }
  return false;
}

export function matchesCollectionRules(
  product: {
    availability: CommercialAvailability;
    lifecycle: string;
    categorySlugs: string[];
    occasionSlugs: string[];
    recipientSlugs: string[];
    styleSlugs: string[];
    flowerSlugs: string[];
    colorSlugs: string[];
    minActivePriceMinor: bigint | null;
  },
  rules: CollectionRulesDto,
): boolean {
  if (rules.requirePublished !== false && product.lifecycle !== 'PUBLISHED') {
    return false;
  }
  const includesAny = (needles: string[] | undefined, hay: string[]) => {
    if (!needles || needles.length === 0) return true;
    return needles.some((n) => hay.includes(n));
  };
  if (!includesAny(rules.categorySlugs, product.categorySlugs)) return false;
  if (!includesAny(rules.occasionSlugs, product.occasionSlugs)) return false;
  if (!includesAny(rules.recipientSlugs, product.recipientSlugs)) return false;
  if (!includesAny(rules.styleSlugs, product.styleSlugs)) return false;
  if (!includesAny(rules.flowerSlugs, product.flowerSlugs)) return false;
  if (!includesAny(rules.colorSlugs, product.colorSlugs)) return false;
  if (rules.availabilities?.length && !rules.availabilities.includes(product.availability)) {
    return false;
  }
  if (product.minActivePriceMinor != null) {
    if (rules.minPriceMinor !== undefined && product.minActivePriceMinor < BigInt(rules.minPriceMinor)) {
      return false;
    }
    if (rules.maxPriceMinor !== undefined && product.minActivePriceMinor > BigInt(rules.maxPriceMinor)) {
      return false;
    }
  } else if (rules.minPriceMinor !== undefined || rules.maxPriceMinor !== undefined) {
    return false;
  }
  return true;
}

export function activeVariantPrices(
  currency: string,
  variants: Array<{ status: string; priceMinor: bigint }>,
) {
  return derivePriceRange(
    currency,
    variants.filter((v) => v.status === 'ACTIVE').map((v) => v.priceMinor),
  );
}

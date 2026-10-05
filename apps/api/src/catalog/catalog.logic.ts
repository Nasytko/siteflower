/**
 * Catalog helpers: publication, slugs, publish validation.
 * Collection rule engine removed — merchandising is Bestsellers + Promotions.
 */
import {
  derivePriceRange,
  type PriceRangeDto,
  type PublishValidationIssue,
} from '@bouquet-one/contracts';

/** Shown to admins when an optimistic-concurrency check fails. */
export const OCC_CONFLICT_MESSAGE =
  'Данные изменены другим пользователем. Обновите страницу и сохраните снова.';

/** Price range of ACTIVE variants only — inactive sizes never shape the storefront price. */
export function activeVariantPrices(
  currency: string,
  variants: ReadonlyArray<{ status: string; priceMinor: bigint }>,
): PriceRangeDto | null {
  return derivePriceRange(
    currency,
    variants.filter((variant) => variant.status === 'ACTIVE').map((variant) => variant.priceMinor),
  );
}

export function isEffectivelyPublished(
  product: {
    lifecycle: string;
    publishAt: Date | null;
    publishedAt: Date | null;
    unpublishAt: Date | null;
  },
  now = new Date(),
): boolean {
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
  } else if (active.some((v) => v.priceMinor <= 0n)) {
    issues.push({
      code: 'PRICE_REQUIRED',
      message: 'Each active size must have a price greater than zero',
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

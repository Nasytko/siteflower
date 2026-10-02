/**
 * Pure helpers for product duplication (slug + display name).
 */
import { normalizeSlug } from '@bouquet-one/contracts';

const COPY_NAME_SUFFIX = ' — копия';
const COPY_SLUG_SUFFIX = '-kopiya';
const MAX_NAME = 200;
const MAX_SLUG = 160;
/** Cap collision attempts to avoid unbounded loops. */
export const DUPLICATE_SLUG_MAX_ATTEMPTS = 50;

export function buildDuplicateProductName(sourceName: string): string {
  const base = sourceName.trim() || 'Товар';
  const suffix = COPY_NAME_SUFFIX;
  if (base.length + suffix.length <= MAX_NAME) {
    return `${base}${suffix}`;
  }
  return `${base.slice(0, Math.max(1, MAX_NAME - suffix.length)).trimEnd()}${suffix}`;
}

export function buildDuplicateSlugCandidate(sourceSlug: string, attempt: number): string {
  const root = normalizeSlug(sourceSlug) || 'tovar';
  const suffix =
    attempt <= 1 ? COPY_SLUG_SUFFIX : `${COPY_SLUG_SUFFIX}-${attempt}`;
  const maxRoot = Math.max(1, MAX_SLUG - suffix.length);
  const clipped = root.slice(0, maxRoot).replace(/-+$/g, '') || 'tovar';
  return normalizeSlug(`${clipped}${suffix}`).slice(0, MAX_SLUG);
}

/**
 * Pick first free slug from candidates. `isTaken` returns true when slug exists.
 */
export async function allocateDuplicateSlug(
  sourceSlug: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 1; attempt <= DUPLICATE_SLUG_MAX_ATTEMPTS; attempt += 1) {
    const candidate = buildDuplicateSlugCandidate(sourceSlug, attempt);
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }
  throw new Error('Could not allocate a unique slug for the product copy');
}

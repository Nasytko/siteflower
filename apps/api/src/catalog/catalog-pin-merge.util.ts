/**
 * Shared pin-first merge for public PLP and admin preview.
 * Pins occupy the start of the combined stream; pagination walks that stream.
 */

export type PinAwareWindow = {
  /** Offset into the ordered pin list for this page. */
  pinSkip: number;
  /** How many pins belong on this page (may be 0). */
  pinTake: number;
  /** Skip/take applied to the rules query (pins already excluded from that query). */
  ruleSkip: number;
  ruleTake: number;
};

/**
 * Window into a combined stream of `[...pins, ...ruleHits]`.
 * Handles pinCount >, =, or < pageSize across multiple pages.
 */
export function pinAwareListWindow(input: {
  page: number;
  pageSize: number;
  pinCount: number;
}): PinAwareWindow {
  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, input.pageSize);
  const pinCount = Math.max(0, input.pinCount);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  const pinSkip = Math.min(start, pinCount);
  const pinTake = Math.max(0, Math.min(end, pinCount) - pinSkip);
  const ruleSkip = Math.max(0, start - pinCount);
  const ruleTake = Math.max(0, end - Math.max(start, pinCount));

  return { pinSkip, pinTake, ruleSkip, ruleTake };
}

/**
 * Merge this page's pin slice with rule hits. Dedupes by id (pins win).
 * `pinnedItems` must already be sliced with pinSkip/pinTake.
 */
export function mergePinnedItems<T extends { id: string }>(input: {
  pinnedItems: T[];
  ruleItems: T[];
  pageSize: number;
}): T[] {
  const pinnedIds = new Set(input.pinnedItems.map((item) => item.id));
  const rest = input.ruleItems.filter((item) => !pinnedIds.has(item.id));
  return [...input.pinnedItems, ...rest].slice(0, Math.max(1, input.pageSize));
}

/**
 * Unique published catalog size for pagination.
 *
 * Callers MUST exclude published pin IDs from the rules query (`overlappingInRules = 0`).
 * If a buggy caller still counted some pins inside `ruleTotal`, pass that overlap so
 * they are not double-counted.
 */
export function combinedTotal(
  ruleTotal: number,
  publishedPinCount: number,
  overlappingInRules = 0,
): number {
  const rules = Math.max(0, ruleTotal);
  const pins = Math.max(0, publishedPinCount);
  const overlap = Math.min(Math.max(0, overlappingInRules), pins, rules);
  return rules + pins - overlap;
}

/** How many pin ids also appear in a rule id list (intersection size). */
export function countPinRuleOverlap(
  publishedPinIds: readonly string[],
  ruleIds: readonly string[],
): number {
  if (publishedPinIds.length === 0 || ruleIds.length === 0) return 0;
  const pins = new Set(publishedPinIds);
  let overlap = 0;
  const seen = new Set<string>();
  for (const id of ruleIds) {
    if (!pins.has(id) || seen.has(id)) continue;
    seen.add(id);
    overlap += 1;
  }
  return overlap;
}

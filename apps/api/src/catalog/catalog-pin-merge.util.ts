/**
 * Shared pin-first merge for public PLP and admin preview.
 * Pins occupy the start of page 1; later pages skip past them.
 */

export type PinAwareWindow = {
  /** Whether to prepend published pins to this page's items. */
  includePins: boolean;
  /** Skip/take applied to the rules query (pins already excluded from that query). */
  ruleSkip: number;
  ruleTake: number;
};

export function pinAwareListWindow(input: {
  page: number;
  pageSize: number;
  pinCount: number;
}): PinAwareWindow {
  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, input.pageSize);
  const pinCount = Math.max(0, input.pinCount);

  if (page === 1) {
    return {
      includePins: pinCount > 0,
      ruleSkip: 0,
      ruleTake: Math.max(0, pageSize - pinCount),
    };
  }

  // Pins consume the first `pinCount` slots of the combined stream on page 1.
  const combinedSkip = (page - 1) * pageSize;
  return {
    includePins: false,
    ruleSkip: Math.max(0, combinedSkip - pinCount),
    ruleTake: pageSize,
  };
}

export function mergePinnedItems<T extends { id: string }>(input: {
  pinnedItems: T[];
  ruleItems: T[];
  includePins: boolean;
  pageSize: number;
}): T[] {
  const pinned = input.includePins ? input.pinnedItems : [];
  const pinnedIds = new Set(pinned.map((item) => item.id));
  const rest = input.ruleItems.filter((item) => !pinnedIds.has(item.id));
  return [...pinned, ...rest].slice(0, input.pageSize);
}

export function combinedTotal(ruleTotal: number, publishedPinCount: number): number {
  return Math.max(0, ruleTotal) + Math.max(0, publishedPinCount);
}

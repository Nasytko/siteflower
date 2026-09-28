/** Shared scroll thresholds for sticky header + hero (wide hysteresis). */
export const SCROLL_COLLAPSE_Y = 80;
export const SCROLL_EXPAND_Y = 20;

/**
 * Hysteresis helper: once compact, stay until scroll drops below expand;
 * once expanded, stay until scroll reaches collapse.
 */
export function nextCompactFromScroll(y: number, currentlyCompact: boolean): boolean {
  return currentlyCompact ? y > SCROLL_EXPAND_Y : y >= SCROLL_COLLAPSE_Y;
}

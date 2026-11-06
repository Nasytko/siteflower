import { minutesSinceMidnightMinsk } from '@/lib/fulfillment-slots';

export type StoreHoursRange = {
  openMinutes: number;
  /** Exclusive end — shop is closed at this minute (e.g. 21:00 → 1260). */
  closeMinutes: number;
};

/** Parse strings like `9:00–21:00`, `09:00 - 21:00`, `пн–вс 9:00—21:00`. */
export function parseWorkingHoursRange(raw: string | null | undefined): StoreHoursRange | null {
  if (!raw?.trim()) return null;
  const match = raw.match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*[–—−\-]\s*(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (!match) return null;
  const openH = Number(match[1]);
  const openM = Number(match[2]);
  const closeH = Number(match[3]);
  const closeM = Number(match[4]);
  if (
    !Number.isFinite(openH) ||
    !Number.isFinite(openM) ||
    !Number.isFinite(closeH) ||
    !Number.isFinite(closeM) ||
    openH > 23 ||
    closeH > 23 ||
    openM > 59 ||
    closeM > 59
  ) {
    return null;
  }
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  if (closeMinutes <= openMinutes) return null;
  return { openMinutes, closeMinutes };
}

/** `true` open, `false` closed, `null` when hours cannot be parsed. */
export function isStoreOpenNow(
  workingHours: string | null | undefined,
  now: Date = new Date(),
): boolean | null {
  const range = parseWorkingHoursRange(workingHours);
  if (!range) return null;
  const mins = minutesSinceMidnightMinsk(now);
  return mins >= range.openMinutes && mins < range.closeMinutes;
}

/**
 * Admin date/time helpers use the shop business timezone (Europe/Minsk),
 * not the administrator's browser timezone.
 */

export const ADMIN_BUSINESS_TIMEZONE = 'Europe/Minsk';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parts of an instant as wall clock in `timeZone`. */
function zonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    return value ? Number(value) : NaN;
  };

  let hour = get('hour');
  // Some engines emit hour "24" for midnight.
  if (hour === 24) hour = 0;

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Convert a business wall-clock `YYYY-MM-DDTHH:mm` into a UTC ISO string.
 * Uses iterative offset correction so DST-free and DST zones both work.
 */
export function businessLocalToUtcIso(
  localValue: string,
  timeZone: string = ADMIN_BUSINESS_TIMEZONE,
): string | null {
  const trimmed = localValue.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');
  if ([year, month, day, hour, minute, second].some((n) => Number.isNaN(n))) return null;

  // Initial guess: treat wall time as UTC, then correct by zone offset at that instant.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const asDate = new Date(utcMs);
    if (Number.isNaN(asDate.getTime())) return null;
    const parts = zonedParts(asDate, timeZone);
    const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = desired - asIfUtc;
    if (diff === 0) break;
    utcMs += diff;
  }

  const result = new Date(utcMs);
  if (Number.isNaN(result.getTime())) return null;
  return result.toISOString();
}

/** Format a UTC ISO instant as `datetime-local` value in the business timezone. */
export function utcIsoToBusinessLocal(
  iso: string | null | undefined,
  timeZone: string = ADMIN_BUSINESS_TIMEZONE,
): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = zonedParts(date, timeZone);
  if ([parts.year, parts.month, parts.day, parts.hour, parts.minute].some((n) => Number.isNaN(n))) {
    return '';
  }
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

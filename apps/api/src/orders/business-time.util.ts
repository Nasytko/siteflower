/**
 * Business calendar helpers for Europe/Minsk fulfillment dates.
 * Never rely on process TZ / browser TZ for commercial dates.
 */

const MINSK = 'Europe/Minsk';

/** YYYY-MM-DD in the given IANA timezone. */
export function businessDateString(now: Date, timeZone = MINSK): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) throw new Error('Failed to format business date');
  return `${y}-${m}-${d}`;
}

/** Minutes from midnight in business timezone. */
export function businessMinutesSinceMidnight(now: Date, timeZone = MINSK): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/** Add calendar days to YYYY-MM-DD (no DST issues — date arithmetic on civil date). */
export function addBusinessDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d! + days));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function compareBusinessDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Earliest moment the selected window may start, as minutes from midnight of fulfillmentDate,
 * compared to "now" with lead time.
 *
 * Window is invalid if:
 * - fulfillmentDate < today
 * - fulfillmentDate > today + maxAdvanceDays
 * - fulfillmentDate === today AND window.startMinutes < nowMinutes + leadMinutes
 */
export function isTimeWindowSelectable(input: {
  fulfillmentDate: string;
  windowStartMinutes: number;
  now: Date;
  minLeadTimeMinutes: number;
  maxAdvanceDays: number;
  timeZone?: string;
}): boolean {
  const tz = input.timeZone ?? MINSK;
  const today = businessDateString(input.now, tz);
  const maxDate = addBusinessDays(today, input.maxAdvanceDays);
  if (compareBusinessDates(input.fulfillmentDate, today) < 0) return false;
  if (compareBusinessDates(input.fulfillmentDate, maxDate) > 0) return false;
  if (input.fulfillmentDate === today) {
    const nowMin = businessMinutesSinceMidnight(input.now, tz);
    if (input.windowStartMinutes < nowMin + input.minLeadTimeMinutes) return false;
  }
  return true;
}

export function orderNumberPrefix(businessDate: string): string {
  // YYMMDD from YYYY-MM-DD
  const compact = businessDate.replace(/-/g, '');
  return compact.slice(2);
}

export function formatOrderNumber(businessDate: string, seq: number): string {
  return `${orderNumberPrefix(businessDate)}-${String(seq).padStart(3, '0')}`;
}

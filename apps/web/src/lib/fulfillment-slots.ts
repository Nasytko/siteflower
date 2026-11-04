import {
  FULFILLMENT_CLOSE_HOUR,
  FULFILLMENT_MIN_LEAD_MINUTES,
  FULFILLMENT_OPEN_HOUR,
  isManagerTimeWindowId,
  type TimeWindowDto,
} from '@bouquet-one/contracts';

const MINSK = 'Europe/Minsk';

export function minutesSinceMidnightMinsk(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MINSK,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function todayMinsk(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MINSK,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function addDaysMinsk(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}-${String(utc.getUTCDate()).padStart(2, '0')}`;
}

function formatHourLabel(startMinutes: number): string {
  const h = Math.floor(startMinutes / 60);
  return `${String(h).padStart(2, '0')}:00`;
}

export type NearestDeliverySlot = {
  /** Civil date YYYY-MM-DD in Europe/Minsk */
  date: string;
  startMinutes: number;
  /** e.g. 16:00–17:00 */
  windowLabel: string;
  /** Short clock for highlight, e.g. к 16:00 */
  clockLabel: string;
  /** today | tomorrow | later */
  dayKind: 'today' | 'tomorrow' | 'later';
  dayLabel: string;
};

/**
 * Next hourly slot: start >= now + lead, within 09:00–21:00 (Minsk).
 * If none left today → first slot tomorrow 09:00.
 */
export function computeNearestDeliverySlot(input?: {
  now?: Date;
  minLeadMinutes?: number;
  openHour?: number;
  closeHour?: number;
}): NearestDeliverySlot {
  const now = input?.now ?? new Date();
  const lead = input?.minLeadMinutes ?? FULFILLMENT_MIN_LEAD_MINUTES;
  const open = (input?.openHour ?? FULFILLMENT_OPEN_HOUR) * 60;
  const close = (input?.closeHour ?? FULFILLMENT_CLOSE_HOUR) * 60;
  const today = todayMinsk(now);
  const earliest = minutesSinceMidnightMinsk(now) + lead;

  const pickOnDate = (date: string, dayKind: NearestDeliverySlot['dayKind']): NearestDeliverySlot | null => {
    const minStart = date === today ? earliest : open;
    // Round up to next full hour start
    let start = Math.ceil(minStart / 60) * 60;
    if (start < open) start = open;
    if (start >= close) return null;
    const end = start + 60;
    const dayLabel =
      dayKind === 'today' ? 'сегодня' : dayKind === 'tomorrow' ? 'завтра' : formatDayLabel(date);
    return {
      date,
      startMinutes: start,
      windowLabel: `${formatHourLabel(start)}–${formatHourLabel(end)}`,
      clockLabel: formatHourLabel(start),
      dayKind,
      dayLabel,
    };
  };

  const todaySlot = pickOnDate(today, 'today');
  if (todaySlot) return todaySlot;

  const tomorrow = addDaysMinsk(today, 1);
  const tomorrowSlot = pickOnDate(tomorrow, 'tomorrow');
  if (tomorrowSlot) return tomorrowSlot;

  // Fallback — should not happen with open < close
  return {
    date: tomorrow,
    startMinutes: open,
    windowLabel: `${formatHourLabel(open)}–${formatHourLabel(open + 60)}`,
    clockLabel: formatHourLabel(open),
    dayKind: 'tomorrow',
    dayLabel: 'завтра',
  };
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  return new Intl.DateTimeFormat('ru-BY', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(utc);
}

/** Display chips for the working-day hourly grid (09…20). */
export function hourlySlotChips(): Array<{ id: string; label: string; startMinutes: number }> {
  const chips: Array<{ id: string; label: string; startMinutes: number }> = [];
  for (let hour = FULFILLMENT_OPEN_HOUR; hour < FULFILLMENT_CLOSE_HOUR; hour += 1) {
    const startMinutes = hour * 60;
    chips.push({
      id: `tw-${String(hour).padStart(2, '0')}`,
      label: `${String(hour).padStart(2, '0')}:00`,
      startMinutes,
    });
  }
  return chips;
}

/** Regular hourly slots only (no manager option), filtered by +1h lead for today. */
export function selectableHourlyWindows(input: {
  windows: TimeWindowDto[];
  fulfillmentDate: string;
  fulfillmentType: 'DELIVERY' | 'PICKUP';
  now?: Date;
  minLeadMinutes?: number;
}): TimeWindowDto[] {
  const now = input.now ?? new Date();
  const today = todayMinsk(now);
  const lead = input.minLeadMinutes ?? FULFILLMENT_MIN_LEAD_MINUTES;
  const nowMin = minutesSinceMidnightMinsk(now);

  return input.windows
    .filter((w) => !isManagerTimeWindowId(w.id) && w.active)
    .filter(
      (w) =>
        w.appliesTo === 'BOTH' ||
        w.appliesTo === input.fulfillmentType,
    )
    .filter((w) => {
      if (input.fulfillmentDate !== today) return true;
      return w.startMinutes >= nowMin + lead;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

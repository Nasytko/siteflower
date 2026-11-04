import {
  FULFILLMENT_MIN_LEAD_MINUTES,
  isManagerTimeWindowId,
  type TimeWindowDto,
} from '@bouquet-one/contracts';

const MINSK = 'Europe/Minsk';

function minutesSinceMidnightMinsk(now: Date): number {
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

function todayMinsk(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MINSK,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
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

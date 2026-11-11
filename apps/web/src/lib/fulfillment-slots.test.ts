import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimeWindowDto } from '@bouquet-one/contracts';
import {
  isFulfillmentSlotRejectionMessage,
  isSelectedSlotStale,
  selectableHourlyWindows,
  todayMinsk,
} from './fulfillment-slots';

const HOURLY: TimeWindowDto[] = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((hour) => ({
  id: `tw-${String(hour).padStart(2, '0')}`,
  label: `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`,
  startMinutes: hour * 60,
  endMinutes: (hour + 1) * 60,
  appliesTo: 'BOTH' as const,
  active: true,
  sortOrder: hour,
}));

function minskWall(isoLocal: string): Date {
  // Interpret "YYYY-MM-DDTHH:mm:ss" as Europe/Minsk civil time → UTC Date.
  // Minsk is UTC+3 year-round.
  return new Date(`${isoLocal}+03:00`);
}

test('selectableHourlyWindows drops slots that fell below lead while checkout is open', () => {
  const now = minskWall('2026-03-15T14:10:00');
  const today = todayMinsk(now);
  const available = selectableHourlyWindows({
    windows: HOURLY,
    fulfillmentDate: today,
    fulfillmentType: 'DELIVERY',
    now,
    minLeadMinutes: 60,
  });
  // 14:10 + 60 = 15:10 → earliest start 16:00
  assert.ok(available.every((w) => w.startMinutes >= 16 * 60));
  assert.equal(
    isSelectedSlotStale({
      selectedId: 'tw-15',
      windows: HOURLY,
      fulfillmentDate: today,
      fulfillmentType: 'DELIVERY',
      now,
      minLeadMinutes: 60,
    }),
    true,
  );
  assert.equal(
    isSelectedSlotStale({
      selectedId: 'tw-16',
      windows: HOURLY,
      fulfillmentDate: today,
      fulfillmentType: 'DELIVERY',
      now,
      minLeadMinutes: 60,
    }),
    false,
  );
});

test('midnight in Minsk resets today filter to a new civil date', () => {
  const before = minskWall('2026-03-15T23:50:00');
  const after = minskWall('2026-03-16T00:05:00');
  const beforeToday = todayMinsk(before);
  const afterToday = todayMinsk(after);
  assert.notEqual(beforeToday, afterToday);

  const selectedOnOldToday = selectableHourlyWindows({
    windows: HOURLY,
    fulfillmentDate: beforeToday,
    fulfillmentType: 'DELIVERY',
    now: after,
    minLeadMinutes: 60,
  });
  // Fulfillment date is yesterday relative to `after` → all hourly slots stay selectable
  // (lead applies only when fulfillmentDate === todayMinsk(now)).
  assert.equal(selectedOnOldToday.length, HOURLY.length);

  const onNewToday = selectableHourlyWindows({
    windows: HOURLY,
    fulfillmentDate: afterToday,
    fulfillmentType: 'DELIVERY',
    now: after,
    minLeadMinutes: 60,
  });
  assert.ok(onNewToday.every((w) => w.startMinutes >= 60)); // 00:05 + 60 → from 01:00, open from 09:00
  assert.equal(onNewToday[0]?.id, 'tw-09');
});

test('pickup vs delivery filters applyTo; manager agreement never stale', () => {
  const mixed: TimeWindowDto[] = [
    { ...HOURLY[0]!, id: 'tw-del', appliesTo: 'DELIVERY' },
    { ...HOURLY[1]!, id: 'tw-pick', appliesTo: 'PICKUP' },
    { ...HOURLY[2]!, id: 'tw-both', appliesTo: 'BOTH' },
  ];
  const now = minskWall('2026-03-15T08:00:00');
  const today = todayMinsk(now);

  const delivery = selectableHourlyWindows({
    windows: mixed,
    fulfillmentDate: today,
    fulfillmentType: 'DELIVERY',
    now,
    minLeadMinutes: 60,
  });
  assert.deepEqual(
    delivery.map((w) => w.id),
    ['tw-del', 'tw-both'],
  );

  const pickup = selectableHourlyWindows({
    windows: mixed,
    fulfillmentDate: today,
    fulfillmentType: 'PICKUP',
    now,
    minLeadMinutes: 60,
  });
  assert.deepEqual(
    pickup.map((w) => w.id),
    ['tw-pick', 'tw-both'],
  );

  assert.equal(
    isSelectedSlotStale({
      selectedId: 'tw-manager',
      windows: mixed,
      fulfillmentDate: today,
      fulfillmentType: 'DELIVERY',
      now,
      agreeWithManager: true,
    }),
    false,
  );
});

test('isFulfillmentSlotRejectionMessage matches server boundary errors', () => {
  assert.equal(isFulfillmentSlotRejectionMessage('Выбранные дата или время недоступны'), true);
  assert.equal(isFulfillmentSlotRejectionMessage('Выберите доступный интервал времени'), true);
  assert.equal(isFulfillmentSlotRejectionMessage('Сумма заказа изменилась'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { isStoreOpenNow, parseWorkingHoursRange } from './store-hours.js';

test('parseWorkingHoursRange accepts en-dash and hyphen', () => {
  assert.deepEqual(parseWorkingHoursRange('9:00–21:00'), {
    openMinutes: 9 * 60,
    closeMinutes: 21 * 60,
  });
  assert.deepEqual(parseWorkingHoursRange('09:00 - 21:00'), {
    openMinutes: 9 * 60,
    closeMinutes: 21 * 60,
  });
  assert.deepEqual(parseWorkingHoursRange('пн–вс 9:00—21:00'), {
    openMinutes: 9 * 60,
    closeMinutes: 21 * 60,
  });
});

test('parseWorkingHoursRange rejects junk', () => {
  assert.equal(parseWorkingHoursRange(null), null);
  assert.equal(parseWorkingHoursRange('ежедневно'), null);
  assert.equal(parseWorkingHoursRange('22:00–06:00'), null);
});

test('isStoreOpenNow uses Europe/Minsk wall clock', () => {
  // 2026-06-15 12:00 UTC = 15:00 Minsk (UTC+3) → open
  const midday = new Date('2026-06-15T12:00:00.000Z');
  assert.equal(isStoreOpenNow('9:00–21:00', midday), true);

  // 2026-06-15 19:30 UTC = 22:30 Minsk → closed
  const late = new Date('2026-06-15T19:30:00.000Z');
  assert.equal(isStoreOpenNow('9:00–21:00', late), false);

  // Exactly 21:00 Minsk = 18:00 UTC → closed (exclusive end)
  const closing = new Date('2026-06-15T18:00:00.000Z');
  assert.equal(isStoreOpenNow('9:00–21:00', closing), false);

  assert.equal(isStoreOpenNow(null, midday), null);
});

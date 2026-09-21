import {
  addBusinessDays,
  businessDateString,
  formatOrderNumber,
  isTimeWindowSelectable,
} from './business-time.util';
import { maskPhoneE164, normalizeByPhone } from './phone.util';
import { generateTrackingToken, hashTrackingToken } from './tracking-token.util';
import { allowedOrderTransitions, isOrderTransitionAllowed } from '@bouquet-one/contracts';

describe('commerce phone utils', () => {
  it('normalizes common BY formats', () => {
    expect(normalizeByPhone('+375 29 123-45-67')).toBe('+375291234567');
    expect(normalizeByPhone('80291234567')).toBe('+375291234567');
    expect(normalizeByPhone('291234567')).toBe('+375291234567');
    expect(normalizeByPhone('invalid')).toBeNull();
  });

  it('masks middle digits', () => {
    const masked = maskPhoneE164('+375291234567');
    expect(masked).toMatch(/^\+375\d+\*{3}\d{4}$/);
    expect(masked.includes('123')).toBe(false);
  });
});

describe('business time', () => {
  it('uses Europe/Minsk for business date', () => {
    const d = new Date('2026-09-21T22:30:00.000Z');
    expect(businessDateString(d, 'Europe/Minsk')).toBe('2026-09-22');
  });

  it('enforces same-day lead time', () => {
    const now = new Date('2026-09-21T10:00:00.000Z'); // 13:00 Minsk
    const today = businessDateString(now, 'Europe/Minsk');
    expect(
      isTimeWindowSelectable({
        fulfillmentDate: today,
        windowStartMinutes: 14 * 60,
        now,
        minLeadTimeMinutes: 120,
        maxAdvanceDays: 14,
      }),
    ).toBe(false);
    expect(
      isTimeWindowSelectable({
        fulfillmentDate: today,
        windowStartMinutes: 16 * 60,
        now,
        minLeadTimeMinutes: 120,
        maxAdvanceDays: 14,
      }),
    ).toBe(true);
  });

  it('formats order numbers and adds business days', () => {
    expect(addBusinessDays('2026-09-21', 1)).toBe('2026-09-22');
    // YYMMDD-NNN from Europe/Minsk business date
    expect(formatOrderNumber('2026-09-21', 7)).toBe('260921-007');
  });
});

describe('tracking token', () => {
  it('has high entropy and stores only hash', () => {
    const a = generateTrackingToken();
    const b = generateTrackingToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashTrackingToken(a)).toHaveLength(64);
    expect(hashTrackingToken(a)).not.toBe(a);
  });
});

describe('order status transitions', () => {
  it('delivery path', () => {
    expect(allowedOrderTransitions('RECEIVED', 'DELIVERY')).toEqual([
      'CONFIRMED',
      'CANCELLED',
    ]);
    expect(allowedOrderTransitions('READY', 'DELIVERY')).toEqual([
      'DELIVERING',
      'CANCELLED',
    ]);
    expect(isOrderTransitionAllowed('READY', 'COMPLETED', 'DELIVERY')).toBe(false);
    expect(isOrderTransitionAllowed('DELIVERING', 'COMPLETED', 'DELIVERY')).toBe(true);
  });

  it('pickup path skips delivering', () => {
    expect(allowedOrderTransitions('READY', 'PICKUP')).toEqual([
      'COMPLETED',
      'CANCELLED',
    ]);
    expect(isOrderTransitionAllowed('READY', 'DELIVERING', 'PICKUP')).toBe(false);
  });

  it('blocks terminal transitions', () => {
    expect(allowedOrderTransitions('COMPLETED', 'DELIVERY')).toEqual([]);
    expect(allowedOrderTransitions('CANCELLED', 'PICKUP')).toEqual([]);
  });
});

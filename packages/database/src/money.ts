/**
 * Money helpers — never use IEEE-754 floats as commercial source of truth.
 *
 * Strategy (documented in docs/database.md):
 * - Persist amounts as integer minor units (e.g. kopecks) in PostgreSQL BIGINT
 * - Or Decimal(19,4) when fractional subunits beyond kopecks are required
 * - Perform arithmetic with integer math or Decimal libraries, never JS number floats
 */

export type MoneyMinor = {
  /** ISO 4217 currency code, e.g. BYN */
  currency: string;
  /** Integer amount in minor units (kopecks for BYN) */
  amountMinor: bigint;
};

export function assertSafeMoneyMinor(value: MoneyMinor): void {
  if (!/^[A-Z]{3}$/.test(value.currency)) {
    throw new Error(`Invalid currency code: ${value.currency}`);
  }
  if (typeof value.amountMinor !== 'bigint') {
    throw new Error('amountMinor must be bigint');
  }
}

export function formatMoneyMinor(value: MoneyMinor, fractionDigits = 2): string {
  assertSafeMoneyMinor(value);
  const negative = value.amountMinor < 0n;
  const abs = negative ? -value.amountMinor : value.amountMinor;
  const scale = 10n ** BigInt(fractionDigits);
  const whole = abs / scale;
  const fraction = abs % scale;
  const sign = negative ? '-' : '';
  return `${sign}${whole.toString()}.${fraction.toString().padStart(fractionDigits, '0')} ${value.currency}`;
}

export function addMoneyMinor(a: MoneyMinor, b: MoneyMinor): MoneyMinor {
  assertSafeMoneyMinor(a);
  assertSafeMoneyMinor(b);
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return { currency: a.currency, amountMinor: a.amountMinor + b.amountMinor };
}

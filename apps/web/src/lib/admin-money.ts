/**
 * Admin types money in major BYN ("129,90"); contracts and API use integer minor units.
 */

/** Minor units -> editable major string ("12990" -> "129,90"). Blank for null. */
export function minorToMajorInput(amountMinor: string | null | undefined): string {
  if (amountMinor === null || amountMinor === undefined || amountMinor === '') return '';
  let value: bigint;
  try {
    value = BigInt(amountMinor);
  } catch {
    return '';
  }
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const cents = abs % 100n;
  return `${negative ? '-' : ''}${whole.toString()},${cents.toString().padStart(2, '0')}`;
}

/** Major input -> minor units string. Returns null for blank or malformed input. */
export function majorInputToMinor(input: string): string | null {
  const normalized = input.replace(/\s|\u00a0/g, '').replace(',', '.');
  if (normalized.length === 0) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const cents = `${fraction}00`.slice(0, 2);
  return (BigInt(whole) * 100n + BigInt(cents)).toString();
}

/** True when the field is empty or a well-formed major amount. */
export function isMajorInputValid(input: string): boolean {
  return input.trim().length === 0 || majorInputToMinor(input) !== null;
}

/** Compare minor-unit strings; null means "open bound". */
export function minorLessOrEqual(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return true;
  return BigInt(a) <= BigInt(b);
}

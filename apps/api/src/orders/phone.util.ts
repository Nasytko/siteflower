/**
 * Belarusian phone normalization — server is source of truth.
 * Accepts +375…, 375…, 80…, 8 0…, spaces/dashes/parentheses.
 * Returns E.164-like +375XXXXXXXXX or null if invalid.
 */
export function normalizeByPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let national: string | null = null;

  if (digits.startsWith('375') && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith('80') && digits.length === 11) {
    national = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 10) {
    national = digits.slice(1);
  } else if (digits.length === 9) {
    national = digits;
  }

  if (!national || national.length !== 9) return null;
  // Mobile operators in BY: 25, 29, 33, 44 typically; also allow 17 (Minsk landline) etc.
  if (!/^[1-9]\d{8}$/.test(national)) return null;
  return `+375${national}`;
}

/** Mask E.164 for customer-facing surfaces: +37529***4567 */
export function maskPhoneE164(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 8) return '***';
  const tail = digits.slice(-4);
  const head = digits.slice(0, Math.min(5, digits.length - 4));
  return `+${head}***${tail}`;
}

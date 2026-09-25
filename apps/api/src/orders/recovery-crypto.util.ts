import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/** Current write key version. Bump when rotating ORDER_RECOVERY_ENCRYPTION_KEY. */
export const ORDER_RECOVERY_KEY_VERSION = 1;

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export type OrderRecoveryPayload = {
  trackingToken: string;
  orderId: string;
  orderNumber: string;
};

export class RecoveryCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryCryptoError';
  }
}

/**
 * Decode ORDER_RECOVERY_ENCRYPTION_KEY (base64) → exactly 32 bytes.
 * Never log the returned key.
 */
export function decodeOrderRecoveryKey(raw: string | undefined | null): Buffer {
  if (!raw || raw.trim().length === 0) {
    throw new RecoveryCryptoError('ORDER_RECOVERY_ENCRYPTION_KEY is required');
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), 'base64');
  } catch {
    throw new RecoveryCryptoError('ORDER_RECOVERY_ENCRYPTION_KEY must be valid base64');
  }
  if (key.length !== KEY_LENGTH) {
    throw new RecoveryCryptoError(
      `ORDER_RECOVERY_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length})`,
    );
  }
  return key;
}

/**
 * AES-256-GCM encrypt. Output layout: iv(12) || authTag(16) || ciphertext.
 * Unique random IV per call — never reuse IV with the same key.
 */
export function encryptRecoveryPayload(
  payload: OrderRecoveryPayload,
  key: Buffer,
): Buffer {
  if (key.length !== KEY_LENGTH) {
    throw new RecoveryCryptoError('Invalid recovery encryption key length');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Decrypt and authenticate recovery blob. Fails closed on tampering.
 */
export function decryptRecoveryPayload(
  blob: Buffer,
  key: Buffer,
): OrderRecoveryPayload {
  if (key.length !== KEY_LENGTH) {
    throw new RecoveryCryptoError('Invalid recovery encryption key length');
  }
  if (blob.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new RecoveryCryptoError('Recovery payload too short');
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(plaintext.toString('utf8')) as OrderRecoveryPayload;
    if (
      typeof parsed.trackingToken !== 'string' ||
      typeof parsed.orderId !== 'string' ||
      typeof parsed.orderNumber !== 'string'
    ) {
      throw new RecoveryCryptoError('Recovery payload missing required fields');
    }
    return parsed;
  } catch (error) {
    if (error instanceof RecoveryCryptoError) throw error;
    throw new RecoveryCryptoError('Recovery payload decryption failed');
  }
}

/** Constant-time compare for secrets of equal length. */
export function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

import { randomBytes } from 'node:crypto';
import {
  decodeOrderRecoveryKey,
  decryptRecoveryPayload,
  encryptRecoveryPayload,
  RecoveryCryptoError,
} from './recovery-crypto.util';

describe('recovery-crypto', () => {
  const key = randomBytes(32);
  const keyB64 = key.toString('base64');

  it('round-trips recovery payload', () => {
    const decoded = decodeOrderRecoveryKey(keyB64);
    const blob = encryptRecoveryPayload(
      {
        trackingToken: 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDE',
        orderId: '11111111-1111-1111-1111-111111111111',
        orderNumber: '260922-0001',
      },
      decoded,
    );
    const out = decryptRecoveryPayload(blob, decoded);
    expect(out.orderNumber).toBe('260922-0001');
    expect(out.trackingToken.startsWith('tok_')).toBe(true);
  });

  it('rejects wrong key length', () => {
    expect(() => decodeOrderRecoveryKey(Buffer.alloc(16).toString('base64'))).toThrow(
      RecoveryCryptoError,
    );
  });

  it('fails closed on tampered ciphertext', () => {
    const blob = encryptRecoveryPayload(
      {
        trackingToken: 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDE',
        orderId: '11111111-1111-1111-1111-111111111111',
        orderNumber: '260922-0001',
      },
      key,
    );
    const tampered = Buffer.from(blob);
    const last = tampered.length - 1;
    tampered[last] = (tampered[last] ?? 0) ^ 0xff;
    expect(() => decryptRecoveryPayload(tampered, key)).toThrow(RecoveryCryptoError);
  });

  it('fails closed on wrong key', () => {
    const blob = encryptRecoveryPayload(
      {
        trackingToken: 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDE',
        orderId: '11111111-1111-1111-1111-111111111111',
        orderNumber: '260922-0001',
      },
      key,
    );
    expect(() => decryptRecoveryPayload(blob, randomBytes(32))).toThrow(RecoveryCryptoError);
  });

  it('uses unique IV per encryption', () => {
    const payload = {
      trackingToken: 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDE',
      orderId: '11111111-1111-1111-1111-111111111111',
      orderNumber: '260922-0001',
    };
    const a = encryptRecoveryPayload(payload, key);
    const b = encryptRecoveryPayload(payload, key);
    expect(a.equals(b)).toBe(false);
  });
});

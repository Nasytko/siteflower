import { createHash, createHmac } from 'node:crypto';
import {
  buildCanonicalString,
  computeExpectedSignature,
  generateNonce,
  sha256Hex,
  signRequest,
  verifySignature,
} from './hmac';

describe('integration hmac', () => {
  const secret = 'test-secret-at-least-thirty-two-chars!!';
  const keyId = 'siteflower-dev-key';
  const timestamp = '1727587200';
  const nonce = '00112233445566778899aabbccddeeff';
  const method = 'POST';
  const path = '/api/v1/integration/simulator/orders';
  const bodyUtf8 = '{"eventId":"00000000-0000-4000-8000-000000000001"}';

  it('sha256Hex matches node crypto', () => {
    expect(sha256Hex(bodyUtf8)).toBe(createHash('sha256').update(bodyUtf8).digest('hex'));
  });

  it('buildCanonicalString uses exact v1 format', () => {
    const bodyHashHex = sha256Hex(bodyUtf8);
    const canonical = buildCanonicalString({
      keyId,
      timestamp,
      nonce,
      method,
      path,
      bodyHashHex,
    });
    expect(canonical).toBe(
      `v1\n${keyId}\n${timestamp}\n${nonce}\n${method}\n${path}\n${bodyHashHex}`,
    );
  });

  it('signRequest is deterministic for fixed inputs', () => {
    const bodyHashHex = sha256Hex(bodyUtf8);
    const expectedSig = createHmac('sha256', secret)
      .update(
        buildCanonicalString({
          keyId,
          timestamp,
          nonce,
          method,
          path,
          bodyHashHex,
        }),
        'utf8',
      )
      .digest('hex');

    const signed = signRequest({
      secret,
      keyId,
      timestamp,
      nonce,
      method,
      path,
      bodyUtf8,
    });

    expect(signed.bodyHashHex).toBe(bodyHashHex);
    expect(signed.signatureHex).toBe(expectedSig);
    expect(signed.headers['X-Bouquet-Integration-Signature']).toBe(expectedSig);
    expect(signed.headers['X-Bouquet-Integration-Key']).toBe(keyId);
    expect(signed.headers['X-Bouquet-Integration-Timestamp']).toBe(timestamp);
    expect(signed.headers['X-Bouquet-Integration-Nonce']).toBe(nonce);
    expect(signed.headers['X-Bouquet-Integration-Version']).toBe('1');
  });

  it('verifySignature is timing-safe and rejects mismatch', () => {
    const signed = signRequest({
      secret,
      keyId,
      timestamp,
      nonce,
      method,
      path,
      bodyUtf8,
    });
    expect(verifySignature(signed.signatureHex, signed.signatureHex)).toBe(true);
    expect(verifySignature(signed.signatureHex, '0'.repeat(signed.signatureHex.length))).toBe(
      false,
    );
    expect(verifySignature(signed.signatureHex, 'abc')).toBe(false);
  });

  it('computeExpectedSignature matches signRequest', () => {
    const signed = signRequest({
      secret,
      keyId,
      timestamp,
      nonce,
      method,
      path,
      bodyUtf8,
    });
    expect(
      computeExpectedSignature({
        secret,
        keyId,
        timestamp,
        nonce,
        method,
        path,
        bodyHashHex: signed.bodyHashHex,
      }),
    ).toBe(signed.signatureHex);
  });

  it('generateNonce returns 32 hex chars', () => {
    const n = generateNonce();
    expect(n).toMatch(/^[0-9a-f]{32}$/);
  });
});

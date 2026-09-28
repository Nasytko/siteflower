import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  INTEGRATION_HEADERS,
  INTEGRATION_HMAC_VERSION,
} from '@bouquet-one/contracts';

export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Canonical string for HMAC-SHA256 (protocol v1).
 *
 * Exact format (newline-separated, no trailing newline):
 * ```
 * v1\n${keyId}\n${timestamp}\n${nonce}\n${method}\n${path}\n${bodyHashHex}
 * ```
 *
 * - method: uppercase HTTP verb (e.g. POST)
 * - path: URL pathname only (no query), e.g. `/api/v1/integration/orders`
 * - bodyHashHex: lowercase hex SHA-256 of exact UTF-8 body bytes (empty body → hash of "")
 * - timestamp: unix seconds as decimal string
 */
export function buildCanonicalString(input: {
  keyId: string;
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  bodyHashHex: string;
}): string {
  return [
    'v1',
    input.keyId,
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.path,
    input.bodyHashHex,
  ].join('\n');
}

export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

export function signRequest(input: {
  secret: string;
  keyId: string;
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  bodyUtf8: string;
}): {
  bodyHashHex: string;
  signatureHex: string;
  headers: Record<string, string>;
} {
  const bodyHashHex = sha256Hex(input.bodyUtf8);
  const canonical = buildCanonicalString({
    keyId: input.keyId,
    timestamp: input.timestamp,
    nonce: input.nonce,
    method: input.method,
    path: input.path,
    bodyHashHex,
  });
  const signatureHex = createHmac('sha256', input.secret).update(canonical, 'utf8').digest('hex');
  return {
    bodyHashHex,
    signatureHex,
    headers: {
      [INTEGRATION_HEADERS.key]: input.keyId,
      [INTEGRATION_HEADERS.timestamp]: input.timestamp,
      [INTEGRATION_HEADERS.nonce]: input.nonce,
      [INTEGRATION_HEADERS.signature]: signatureHex,
      [INTEGRATION_HEADERS.version]: INTEGRATION_HMAC_VERSION,
      'Content-Type': 'application/json; charset=utf-8',
    },
  };
}

/** Constant-time hex signature compare. Returns false on length mismatch. */
export function verifySignature(expectedHex: string, providedHex: string): boolean {
  if (!expectedHex || !providedHex) return false;
  const left = Buffer.from(expectedHex, 'utf8');
  const right = Buffer.from(providedHex, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function computeExpectedSignature(input: {
  secret: string;
  keyId: string;
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  bodyHashHex: string;
}): string {
  const canonical = buildCanonicalString(input);
  return createHmac('sha256', input.secret).update(canonical, 'utf8').digest('hex');
}

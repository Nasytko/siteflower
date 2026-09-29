export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
  /** Optional cache hint for object stores that support it. */
  cacheControl?: string;
};

export type ObjectHead = {
  exists: boolean;
  byteSize?: number;
  contentType?: string;
};

/**
 * Storage port for media objects.
 * Domain/services must not import AWS SDK types.
 *
 * Invariant: keys are server-generated UUIDs under masters/ and derivatives/.
 * UUID keys are effectively immutable content — safe for long CDN cache
 * when bytes under a key never change (replacement = new asset + new key).
 */
export interface MediaStorage {
  put(input: PutObjectInput): Promise<void>;
  delete(key: string): Promise<void>;
  /** Read object bytes; null if missing. */
  get(key: string): Promise<Buffer | null>;
  /** Existence / lightweight metadata without full download when possible. */
  head(key: string): Promise<ObjectHead>;
  /** Public or app-served URL for a storage key. */
  getPublicUrl(key: string): string;
  /** Driver label for diagnostics (local | s3). */
  readonly driver: 'local' | 's3';
}

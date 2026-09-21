export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export interface MediaStorage {
  put(input: PutObjectInput): Promise<void>;
  delete(key: string): Promise<void>;
  /** Public or app-served URL for a storage key */
  getPublicUrl(key: string): string;
}

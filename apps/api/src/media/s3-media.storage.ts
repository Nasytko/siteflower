import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { MediaStorage, ObjectHead, PutObjectInput } from './media-storage';

export type S3MediaStorageOptions = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  forcePathStyle?: boolean;
};

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  const maybe = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybe.transformToByteArray === 'function') {
    return Buffer.from(await maybe.transformToByteArray());
  }
  // Node.js Readable
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class S3MediaStorage implements MediaStorage {
  readonly driver = 's3' as const;
  private readonly client: S3Client;

  constructor(private readonly options: S3MediaStorageOptions) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async put(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl ?? 'public, max-age=31536000, immutable',
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
      }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
        }),
      );
      return streamToBuffer(result.Body);
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw err;
    }
  }

  async head(key: string): Promise<ObjectHead> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
        }),
      );
      return {
        exists: true,
        byteSize: result.ContentLength,
        contentType: result.ContentType,
      };
    } catch (err) {
      const name = (err as { name?: string }).name;
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) {
        return { exists: false };
      }
      throw err;
    }
  }

  getPublicUrl(key: string): string {
    const base = this.options.publicBaseUrl.replace(/\/$/, '');
    return `${base}/${key}`;
  }
}

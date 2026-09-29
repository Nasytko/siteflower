import { access, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveMediaPathInsideRoot } from './media-path.util';
import type { MediaStorage, ObjectHead, PutObjectInput } from './media-storage';

export class LocalMediaStorage implements MediaStorage {
  readonly driver = 'local' as const;

  constructor(
    private readonly rootDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  private resolveSafe(key: string): string | null {
    return resolveMediaPathInsideRoot(this.rootDir, key);
  }

  async put(input: PutObjectInput): Promise<void> {
    const fullPath = this.resolveSafe(input.key);
    if (!fullPath) {
      throw new Error('Invalid storage key');
    }
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.body);
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveSafe(key);
    if (!fullPath) return;
    try {
      await unlink(fullPath);
    } catch {
      // missing is fine — idempotent cleanup
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const fullPath = this.resolveSafe(key);
    if (!fullPath) return null;
    try {
      return await readFile(fullPath);
    } catch {
      return null;
    }
  }

  async head(key: string): Promise<ObjectHead> {
    const fullPath = this.resolveSafe(key);
    if (!fullPath) return { exists: false };
    try {
      await access(fullPath);
      const info = await stat(fullPath);
      return { exists: true, byteSize: info.size };
    } catch {
      return { exists: false };
    }
  }

  getPublicUrl(key: string): string {
    const base = this.publicBaseUrl.replace(/\/$/, '');
    return `${base}/${key.split('\\').join('/')}`;
  }
}

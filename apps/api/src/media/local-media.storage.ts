import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { MediaStorage, PutObjectInput } from './media-storage';

export class LocalMediaStorage implements MediaStorage {
  constructor(
    private readonly rootDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  async put(input: PutObjectInput): Promise<void> {
    const fullPath = join(this.rootDir, input.key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.body);
  }

  async delete(key: string): Promise<void> {
    const fullPath = join(this.rootDir, key);
    try {
      await unlink(fullPath);
    } catch {
      // ignore missing
    }
  }

  getPublicUrl(key: string): string {
    const base = this.publicBaseUrl.replace(/\/$/, '');
    return `${base}/${key.split('\\').join('/')}`;
  }
}

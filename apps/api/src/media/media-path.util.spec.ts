import { resolve } from 'node:path';
import { resolveMediaPathInsideRoot } from './media-path.util';

describe('resolveMediaPathInsideRoot', () => {
  const root = resolve('/tmp/media-root');

  it('allows normal relative keys', () => {
    const full = resolveMediaPathInsideRoot(root, 'masters/abc.jpg');
    expect(full).toBe(resolve(root, 'masters/abc.jpg'));
  });

  it('rejects .. traversal', () => {
    expect(resolveMediaPathInsideRoot(root, '../secret.txt')).toBeNull();
    expect(resolveMediaPathInsideRoot(root, 'masters/../../etc/passwd')).toBeNull();
  });

  it('rejects absolute paths', () => {
    expect(resolveMediaPathInsideRoot(root, '/etc/passwd')).toBeNull();
  });

  it('rejects empty / nullish', () => {
    expect(resolveMediaPathInsideRoot(root, '')).toBeNull();
    expect(resolveMediaPathInsideRoot(root, null)).toBeNull();
  });

  it('rejects null bytes', () => {
    expect(resolveMediaPathInsideRoot(root, 'masters/ab\0c.jpg')).toBeNull();
  });
});

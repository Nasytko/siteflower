import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';

/**
 * Resolve a relative media key under rootDir. Returns null on any traversal /
 * absolute / empty path. Does not rely solely on checking for literal "..".
 */
export function resolveMediaPathInsideRoot(
  rootDir: string,
  relativeKey: string | undefined | null,
): string | null {
  if (!relativeKey || typeof relativeKey !== 'string') return null;
  const trimmed = relativeKey.trim();
  if (!trimmed || trimmed.includes('\0')) return null;

  // Reject absolute keys (POSIX and Windows) before join semantics matter.
  if (isAbsolute(trimmed) || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return null;
  }

  const root = resolve(rootDir);
  const candidate = resolve(root, normalize(trimmed));
  const rel = relative(root, candidate);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  // Extra separator-aware guard for Windows edge cases
  if (rel.split(sep).includes('..')) {
    return null;
  }
  return candidate;
}

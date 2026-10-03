/** Next orphanedAt value after a reference-count change. */
export function nextOrphanedAt(refCount: number, now: Date = new Date()): Date | null {
  return refCount <= 0 ? now : null;
}

/** True when orphanedAt is set and older than the grace window. */
export function isPastOrphanGrace(
  orphanedAt: Date | null | undefined,
  graceHours: number,
  now: Date = new Date(),
): boolean {
  if (!orphanedAt) return false;
  const cutoffMs = now.getTime() - graceHours * 60 * 60 * 1000;
  return orphanedAt.getTime() <= cutoffMs;
}

/** Cutoff timestamp: orphans with orphanedAt strictly before this are cleanup-eligible. */
export function orphanGraceCutoff(graceHours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - graceHours * 60 * 60 * 1000);
}

import {
  isPastOrphanGrace,
  nextOrphanedAt,
  orphanGraceCutoff,
} from './media-orphan.util';

describe('media-orphan.util', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');

  it('marks orphanedAt only when refCount is zero', () => {
    expect(nextOrphanedAt(0, now)).toEqual(now);
    expect(nextOrphanedAt(1, now)).toBeNull();
    expect(nextOrphanedAt(2, now)).toBeNull();
  });

  it('requires orphanedAt and full grace window before cleanup', () => {
    expect(isPastOrphanGrace(null, 168, now)).toBe(false);
    expect(isPastOrphanGrace(now, 168, now)).toBe(false);
    expect(isPastOrphanGrace(new Date('2026-10-02T12:00:00.000Z'), 168, now)).toBe(false);
    expect(isPastOrphanGrace(new Date('2026-09-26T12:00:00.000Z'), 168, now)).toBe(true);
    expect(isPastOrphanGrace(new Date('2026-09-26T11:59:59.000Z'), 168, now)).toBe(true);
  });

  it('computes 7-day grace cutoff from orphanedAt clock', () => {
    expect(orphanGraceCutoff(168, now).toISOString()).toBe('2026-09-26T12:00:00.000Z');
  });
});

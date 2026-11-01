import {
  combinedTotal,
  mergePinnedItems,
  pinAwareListWindow,
} from './catalog-pin-merge.util';

describe('catalog-pin-merge', () => {
  it('page 1 reserves slots for pins then fills from rules', () => {
    expect(pinAwareListWindow({ page: 1, pageSize: 24, pinCount: 3 })).toEqual({
      includePins: true,
      ruleSkip: 0,
      ruleTake: 21,
    });
  });

  it('page 1 with more pins than pageSize still includes pins only', () => {
    expect(pinAwareListWindow({ page: 1, pageSize: 2, pinCount: 5 })).toEqual({
      includePins: true,
      ruleSkip: 0,
      ruleTake: 0,
    });
  });

  it('page 2 skips past pin slots in the combined stream', () => {
    expect(pinAwareListWindow({ page: 2, pageSize: 10, pinCount: 3 })).toEqual({
      includePins: false,
      ruleSkip: 7,
      ruleTake: 10,
    });
  });

  it('merges pins first and drops duplicate rule hits', () => {
    const merged = mergePinnedItems({
      pinnedItems: [{ id: 'p1' }, { id: 'p2' }],
      ruleItems: [{ id: 'p2' }, { id: 'r1' }, { id: 'r2' }],
      includePins: true,
      pageSize: 3,
    });
    expect(merged.map((i) => i.id)).toEqual(['p1', 'p2', 'r1']);
  });

  it('does not prepend pins on later pages', () => {
    const merged = mergePinnedItems({
      pinnedItems: [{ id: 'p1' }],
      ruleItems: [{ id: 'r1' }],
      includePins: false,
      pageSize: 24,
    });
    expect(merged.map((i) => i.id)).toEqual(['r1']);
  });

  it('combined total adds published pins to rule total', () => {
    expect(combinedTotal(40, 3)).toBe(43);
  });

  it('combined total ignores negative inputs', () => {
    expect(combinedTotal(-1, -2)).toBe(0);
  });

  it('page 1 with zero pins behaves like a normal window', () => {
    expect(pinAwareListWindow({ page: 1, pageSize: 24, pinCount: 0 })).toEqual({
      includePins: false,
      ruleSkip: 0,
      ruleTake: 24,
    });
  });
});

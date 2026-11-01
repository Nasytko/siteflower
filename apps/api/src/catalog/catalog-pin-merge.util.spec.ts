import {
  combinedTotal,
  countPinRuleOverlap,
  mergePinnedItems,
  pinAwareListWindow,
} from './catalog-pin-merge.util';

describe('catalog-pin-merge', () => {
  it('page 1 reserves slots for pins then fills from rules', () => {
    expect(pinAwareListWindow({ page: 1, pageSize: 24, pinCount: 3 })).toEqual({
      pinSkip: 0,
      pinTake: 3,
      ruleSkip: 0,
      ruleTake: 21,
    });
  });

  it('page 1 with pinCount === pageSize takes only pins', () => {
    expect(pinAwareListWindow({ page: 1, pageSize: 5, pinCount: 5 })).toEqual({
      pinSkip: 0,
      pinTake: 5,
      ruleSkip: 0,
      ruleTake: 0,
    });
  });

  it('page 1 with pinCount > pageSize takes first page of pins only', () => {
    expect(pinAwareListWindow({ page: 1, pageSize: 2, pinCount: 5 })).toEqual({
      pinSkip: 0,
      pinTake: 2,
      ruleSkip: 0,
      ruleTake: 0,
    });
  });

  it('overflow pins continue onto page 2 before rules', () => {
    expect(pinAwareListWindow({ page: 2, pageSize: 2, pinCount: 5 })).toEqual({
      pinSkip: 2,
      pinTake: 2,
      ruleSkip: 0,
      ruleTake: 0,
    });
  });

  it('page after pin overflow mixes last pins with rules', () => {
    expect(pinAwareListWindow({ page: 3, pageSize: 2, pinCount: 5 })).toEqual({
      pinSkip: 4,
      pinTake: 1,
      ruleSkip: 0,
      ruleTake: 1,
    });
  });

  it('later pages skip past all pins in the combined stream', () => {
    expect(pinAwareListWindow({ page: 2, pageSize: 10, pinCount: 3 })).toEqual({
      pinSkip: 3,
      pinTake: 0,
      ruleSkip: 7,
      ruleTake: 10,
    });
  });

  it('page 1 with zero pins behaves like a normal window', () => {
    expect(pinAwareListWindow({ page: 1, pageSize: 24, pinCount: 0 })).toEqual({
      pinSkip: 0,
      pinTake: 0,
      ruleSkip: 0,
      ruleTake: 24,
    });
  });

  it('merges page pin slice first and drops duplicate rule hits', () => {
    const merged = mergePinnedItems({
      pinnedItems: [{ id: 'p1' }, { id: 'p2' }],
      ruleItems: [{ id: 'p2' }, { id: 'r1' }, { id: 'r2' }],
      pageSize: 3,
    });
    expect(merged.map((i) => i.id)).toEqual(['p1', 'p2', 'r1']);
  });

  it('page without pins returns rule items only', () => {
    const merged = mergePinnedItems({
      pinnedItems: [],
      ruleItems: [{ id: 'r1' }, { id: 'r2' }],
      pageSize: 24,
    });
    expect(merged.map((i) => i.id)).toEqual(['r1', 'r2']);
  });

  it('combined total with pins excluded from rules does not double-count', () => {
    // pins p1,p2 also match rules; rules query already excluded them → ruleTotal=10
    expect(combinedTotal(10, 2)).toBe(12);
    expect(combinedTotal(10, 2, 0)).toBe(12);
  });

  it('combined total subtracts overlap when pins were left inside ruleTotal', () => {
    // Defensive: ruleTotal still counted 2 pinned ids
    expect(combinedTotal(12, 2, 2)).toBe(12);
    expect(countPinRuleOverlap(['p1', 'p2', 'p3'], ['r1', 'p2', 'p1', 'r2'])).toBe(2);
  });

  it('combined total ignores negative inputs', () => {
    expect(combinedTotal(-1, -2)).toBe(0);
  });

  it('simulates multi-page stream with pin/rule intersection (public=preview)', () => {
    const pins = ['p0', 'p1', 'p2', 'p3', 'p4'];
    // Rules stream after excluding pin ids (p1 would have matched rules but is excluded).
    const rulesExcludingPins = ['r0', 'r1', 'r2', 'r3'];
    const pageSize = 2;
    const pages: string[][] = [];
    for (let page = 1; page <= 5; page += 1) {
      const w = pinAwareListWindow({ page, pageSize, pinCount: pins.length });
      const pagePins = pins.slice(w.pinSkip, w.pinSkip + w.pinTake).map((id) => ({ id }));
      const pageRules = rulesExcludingPins
        .slice(w.ruleSkip, w.ruleSkip + w.ruleTake)
        .map((id) => ({ id }));
      pages.push(
        mergePinnedItems({
          pinnedItems: pagePins,
          ruleItems: pageRules,
          pageSize,
        }).map((i) => i.id),
      );
    }
    expect(pages).toEqual([
      ['p0', 'p1'],
      ['p2', 'p3'],
      ['p4', 'r0'],
      ['r1', 'r2'],
      ['r3'],
    ]);
    const flat = pages.flat();
    expect(new Set(flat).size).toBe(flat.length);
    expect(combinedTotal(rulesExcludingPins.length, pins.length)).toBe(9);
    expect(flat).toHaveLength(9);
  });
});

import { collectCategoryDescendantIds } from './catalog-categories.service';

describe('collectCategoryDescendantIds', () => {
  const rows = [
    { id: 'root', parentId: null, visibility: 'VISIBLE' as const },
    { id: 'child-vis', parentId: 'root', visibility: 'VISIBLE' as const },
    { id: 'child-hid', parentId: 'root', visibility: 'HIDDEN' as const },
    { id: 'grand', parentId: 'child-hid', visibility: 'VISIBLE' as const },
  ];

  it('includes all descendants by default', () => {
    expect(collectCategoryDescendantIds('root', rows).sort()).toEqual(
      ['child-hid', 'child-vis', 'grand', 'root'].sort(),
    );
  });

  it('excludes hidden descendants when visibleOnly', () => {
    expect(collectCategoryDescendantIds('root', rows, { visibleOnly: true }).sort()).toEqual(
      ['child-vis', 'root'].sort(),
    );
  });

  it('does not loop on cyclic parent links', () => {
    const cyclic = [
      { id: 'a', parentId: 'b', visibility: 'VISIBLE' as const },
      { id: 'b', parentId: 'a', visibility: 'VISIBLE' as const },
    ];
    expect(collectCategoryDescendantIds('a', cyclic).sort()).toEqual(['a', 'b'].sort());
  });
});

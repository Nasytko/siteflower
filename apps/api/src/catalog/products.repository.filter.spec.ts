import { buildProductWhere } from './products.repository';

describe('buildProductWhere composition facets', () => {
  it('nests flower type and component color on the same component (white roses)', () => {
    const where = buildProductWhere({
      flowerTypeSlugs: ['roza'],
      componentColorSlugs: ['belyy'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    const componentClause = and.find((clause) => clause.components);
    expect(componentClause).toEqual({
      components: {
        some: {
          flowerItem: { flowerType: { slug: { in: ['roza'] } } },
          color: { slug: { in: ['belyy'] } },
        },
      },
    });
  });

  it('keeps product palette color separate from composition color', () => {
    const where = buildProductWhere({
      colorSlugs: ['krasnyy'],
      flowerTypeSlugs: ['roza'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { colors: { some: { color: { slug: { in: ['krasnyy'] } } } } },
        {
          components: {
            some: { flowerItem: { flowerType: { slug: { in: ['roza'] } } } },
          },
        },
      ]),
    );
  });

  it('filters compositionKind mono only for bouquet/composition kinds', () => {
    const where = buildProductWhere({ compositionKinds: ['MONO'] });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { compositionKind: { in: ['MONO'] } },
        { productKind: { in: ['BOUQUET', 'COMPOSITION'] } },
      ]),
    );
  });

  it('hub PLP filters by productKind only (no category OR)', () => {
    const where = buildProductWhere({
      productKinds: ['BOUQUET'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(expect.arrayContaining([{ productKind: { in: ['BOUQUET'] } }]));
    expect(and.some((clause) => 'OR' in clause)).toBe(false);
  });

  it('category ids and productKinds combine with AND (never OR)', () => {
    const where = buildProductWhere({
      catalogCategoryIds: ['cat-x'],
      productKinds: ['STEM'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { catalogCategoryId: { in: ['cat-x'] } },
        { productKind: { in: ['STEM'] } },
      ]),
    );
    expect(and.some((clause) => 'OR' in clause)).toBe(false);
  });

  it('includeProductIds restricts membership checks for placement', () => {
    const where = buildProductWhere({
      includeProductIds: ['prod-a'],
      productKinds: ['BOUQUET'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { id: { in: ['prod-a'] } },
        { productKind: { in: ['BOUQUET'] } },
      ]),
    );
  });

  it('requires EXACT precision for quantity-by-type', () => {
    const where = buildProductWhere({
      minFlowerTypeQuantity: 11,
      flowerTypeQuantitySlug: 'roza',
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        {
          compositionPrecision: 'EXACT',
          components: {
            some: {
              role: 'PRIMARY',
              quantity: { gte: 11 },
              flowerItem: { flowerType: { slug: 'roza' } },
            },
          },
        },
      ]),
    );
  });

  it('admin productKind filter is AND, not category OR', () => {
    const where = buildProductWhere({
      productKinds: ['STEM'],
      flowerTypeSlugs: ['roza'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { productKind: { in: ['STEM'] } },
        {
          components: {
            some: { flowerItem: { flowerType: { slug: { in: ['roza'] } } } },
          },
        },
      ]),
    );
    expect(and.some((clause) => 'OR' in clause)).toBe(false);
  });

  it('does not cartesian-join products with several composition lines', () => {
    const where = buildProductWhere({
      productKinds: ['BOUQUET'],
      flowerTypeSlugs: ['roza', 'eustoma'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    const componentClause = and.find((clause) => clause.components) as
      | { components?: { some?: unknown; every?: unknown } }
      | undefined;
    expect(componentClause?.components?.some).toBeDefined();
    expect(componentClause?.components?.every).toBeUndefined();
  });

  it('nests variety with type to avoid cross-line false matches', () => {
    const where = buildProductWhere({
      flowerTypeSlugs: ['roza'],
      flowerVarietySlugs: ['mondial'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toContainEqual({
      components: {
        some: {
          flowerItem: {
            flowerType: { slug: { in: ['roza'] } },
            flowerVariety: { slug: { in: ['mondial'] } },
          },
        },
      },
    });
  });
});

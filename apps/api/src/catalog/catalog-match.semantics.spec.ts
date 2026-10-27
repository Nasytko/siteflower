import {
  buildTaxonomySlugIndex,
  FLOWER_TYPE_SLUG_ALIASES,
  resolveCatalogPageRules,
} from '@bouquet-one/contracts';
import { buildProductWhere } from './products.repository';
import { toProductListFilters } from './catalog-match.service';

const ROZA_ID = 'b1000000-0000-4000-8000-000000000001';
const KUSTOVAYA_ID = 'f1000000-0000-4000-8000-000000000001';

const lookup = {
  flowerTypes: buildTaxonomySlugIndex([{ id: ROZA_ID, slug: 'roza' }]),
  flowerForms: buildTaxonomySlugIndex([{ id: KUSTOVAYA_ID, slug: 'kustovaya' }]),
  flowerVarieties: buildTaxonomySlugIndex([]),
  colors: buildTaxonomySlugIndex([]),
  occasions: buildTaxonomySlugIndex([]),
  recipients: buildTaxonomySlugIndex([]),
  flowerTypeAliases: FLOWER_TYPE_SLUG_ALIASES,
};

function whereFromRules(rules: unknown) {
  const { filters, blocking } = resolveCatalogPageRules(rules, lookup);
  expect(blocking).toBe(false);
  return buildProductWhere(toProductListFilters(filters));
}

describe('Unified catalog match semantics (rozy / composition)', () => {
  it('katalog/rozy STEM rules resolve rozy→roza id (not page slug equality)', () => {
    const where = whereFromRules({
      productKinds: ['STEM'],
      flowerTypeSlugs: ['rozy'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { productKind: { in: ['STEM'] } },
        {
          components: {
            some: { flowerItem: { flowerTypeId: { in: [ROZA_ID] } } },
          },
        },
      ]),
    );
    const json = JSON.stringify(where);
    expect(json).not.toContain('rozy');
    expect(json).toContain(ROZA_ID);
  });

  it('STEM rose page does not force MONO (STEM never is a monobouquet)', () => {
    const where = whereFromRules({
      productKinds: ['STEM'],
      flowerTypeSlugs: ['roza'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and.some((c) => c.compositionKind === 'MONO')).toBe(false);
  });

  it('monobukety: MONO + bouquet/composition only — no STEM', () => {
    const where = whereFromRules({
      productKinds: ['BOUQUET', 'COMPOSITION'],
      compositionKinds: ['MONO'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { productKind: { in: ['BOUQUET', 'COMPOSITION'] } },
        { compositionKind: { in: ['MONO'] } },
      ]),
    );
  });

  it('bukety-iz-roz / onlyFlowerType: MONO from type, not mixed', () => {
    const where = whereFromRules({
      productKinds: ['BOUQUET'],
      onlyFlowerType: 'roza',
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { compositionKind: 'MONO' },
        { productKind: { in: ['BOUQUET', 'COMPOSITION'] } },
        {
          components: {
            some: {
              role: 'PRIMARY',
              flowerItem: { flowerTypeId: { in: [ROZA_ID] } },
            },
          },
        },
      ]),
    );
  });

  it('bukety-s-rozami: contains rose (MIXED or mono bouquet), not onlyFlowerType', () => {
    const where = whereFromRules({
      productKinds: ['BOUQUET'],
      containsFlowerType: 'roza',
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and.some((c) => c.compositionKind === 'MONO')).toBe(false);
    expect(and).toEqual(
      expect.arrayContaining([
        { productKind: { in: ['BOUQUET'] } },
        {
          components: {
            some: { flowerItem: { flowerTypeId: { in: [ROZA_ID] } } },
          },
        },
      ]),
    );
  });

  it('kustovye rozy: type + form ids on same component', () => {
    const where = whereFromRules({
      flowerTypeSlugs: ['roza'],
      flowerFormSlugs: ['kustovaya'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        {
          components: {
            some: {
              flowerItem: {
                flowerTypeId: { in: [ROZA_ID] },
                flowerFormId: { in: [KUSTOVAYA_ID] },
              },
            },
          },
        },
      ]),
    );
  });

  it('mixed bouquet page excludes mono-only filter', () => {
    const where = whereFromRules({
      productKinds: ['BOUQUET'],
      compositionKinds: ['MIXED'],
    });
    const and = (where.AND ?? []) as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { compositionKind: { in: ['MIXED'] } },
        { productKind: { in: ['BOUQUET', 'COMPOSITION'] } },
      ]),
    );
  });

  it('publishedAt gate is separate — public list always passes publishedAt', () => {
    const where = buildProductWhere({
      productKinds: ['STEM'],
      flowerTypeIds: [ROZA_ID],
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(where.lifecycle).toBe('PUBLISHED');
  });
});

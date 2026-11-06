import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveCompositionKind,
  resolveStoredCompositionKind,
  type FlowerTypeCompositionClass,
} from '@bouquet-one/contracts';

/**
 * Static seed integrity (no DB):
 * - flowerTypeSlug / occasion / recipient / color links
 * - no legacy component fields
 * - MONO / MIXED / UNKNOWN + DECORATIVE / unclassified classes
 * - idempotent deleteMany→createMany restore pattern for join tables
 */
describe('seed-dev-catalog integrity', () => {
  const source = readFileSync(
    join(__dirname, '../../scripts/seed-dev-catalog.ts'),
    'utf8',
  );

  function requireBlock(pattern: RegExp, label: string): string {
    const match = source.match(pattern);
    if (!match?.[1]) {
      throw new Error(`${label} block not found`);
    }
    return match[1];
  }

  function slugsIn(body: string): string[] {
    return [...body.matchAll(/slug:\s*'([^']+)'/g)]
      .map((m) => m[1])
      .filter((value): value is string => Boolean(value));
  }

  const flowerTypesBody = requireBlock(/const FLOWER_TYPES[\s\S]*?= \[([\s\S]*?)\];/, 'FLOWER_TYPES');
  const occasionsBody = requireBlock(/const OCCASIONS[\s\S]*?= \[([\s\S]*?)\];/, 'OCCASIONS');
  const holidaysBody = requireBlock(/const HOLIDAYS[\s\S]*?= \[([\s\S]*?)\];/, 'HOLIDAYS');
  const recipientsBody = requireBlock(/const RECIPIENTS[\s\S]*?= \[([\s\S]*?)\];/, 'RECIPIENTS');
  const colorsBody = requireBlock(/const COLORS[\s\S]*?= \[([\s\S]*?)\];/, 'COLORS');
  const bouquetsBody = requireBlock(/const BOUQUETS[\s\S]*?= \[([\s\S]*?)\n\];/, 'BOUQUETS');

  const flowerTypeSet = new Set(slugsIn(flowerTypesBody));
  /** Product.occasionIds may point at personal occasions or calendar holidays. */
  const occasionSet = new Set([...slugsIn(occasionsBody), ...slugsIn(holidaysBody)]);
  const recipientSet = new Set(slugsIn(recipientsBody));
  const colorSet = new Set(slugsIn(colorsBody));

  function bouquetSlice(slug: string): string {
    const idx = bouquetsBody.indexOf(`slug: '${slug}'`);
    if (idx < 0) throw new Error(`bouquet ${slug} not found`);
    return bouquetsBody.slice(idx, idx + 1200);
  }

  function listField(slice: string, field: string): string[] {
    const match = slice.match(new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\]`));
    if (!match?.[1]) throw new Error(`missing ${field}`);
    return [...match[1].matchAll(/'([^']+)'/g)]
      .map((m) => m[1])
      .filter((value): value is string => Boolean(value));
  }

  function componentSlugsForBouquet(slug: string): string[] {
    const slice = bouquetSlice(slug);
    const comps = slice.match(/components:\s*\[([\s\S]*?)\]/);
    if (!comps?.[1]) throw new Error(`bouquet ${slug} missing components`);
    const body = comps[1];
    if (/\{\s*\}/.test(body) || /displayName|quantity\s*:|unit\s*:|role\s*:/.test(body)) {
      throw new Error(`bouquet ${slug} has empty or legacy component fields`);
    }
    const slugs = [...body.matchAll(/flowerTypeSlug:\s*'([^']+)'/g)]
      .map((m) => m[1])
      .filter((value): value is string => Boolean(value));
    if (slugs.length === 0) throw new Error(`bouquet ${slug} has no flowerTypeSlug`);
    return slugs;
  }

  function parseFlowerTypeClasses(): Map<string, FlowerTypeCompositionClass | null> {
    const map = new Map<string, FlowerTypeCompositionClass | null>();
    const entries = [...flowerTypesBody.matchAll(/\{[\s\S]*?slug:\s*'([^']+)'[\s\S]*?\}/g)];
    for (const entry of entries) {
      const slug = entry[1];
      if (!slug) continue;
      const block = entry[0];
      if (/compositionClass:\s*null/.test(block)) {
        map.set(slug, null);
      } else if (/compositionClass:\s*'BLOOM'/.test(block)) {
        map.set(slug, 'BLOOM');
      } else if (/compositionClass:\s*'DECORATIVE'/.test(block)) {
        map.set(slug, 'DECORATIVE');
      } else {
        map.set(slug, 'BLOOM'); // upsertFlowerType default when omitted
      }
    }
    return map;
  }

  it('restores component and taxonomy slug links for every bouquet', () => {
    const bouquetSlugs = slugsIn(bouquetsBody);
    expect(bouquetSlugs.length).toBeGreaterThanOrEqual(10);

    for (const slug of bouquetSlugs) {
      const slice = bouquetSlice(slug);
      for (const typeSlug of componentSlugsForBouquet(slug)) {
        expect(flowerTypeSet.has(typeSlug)).toBe(true);
      }
      for (const occasion of listField(slice, 'occasions')) {
        expect(occasionSet.has(occasion)).toBe(true);
      }
      for (const recipient of listField(slice, 'recipients')) {
        expect(recipientSet.has(recipient)).toBe(true);
      }
      for (const color of listField(slice, 'colors')) {
        expect(colorSet.has(color)).toBe(true);
      }
    }
  });

  it('uses deleteMany→createMany restore for components and discovery joins', () => {
    expect(source).toMatch(
      /productComponent\.deleteMany[\s\S]*productComponent\.createMany/,
    );
    expect(source).toMatch(/productOccasion\.deleteMany[\s\S]*productOccasion\.createMany/);
    expect(source).toMatch(/productRecipient\.deleteMany[\s\S]*productRecipient\.createMany/);
    expect(source).toMatch(/productColor\.deleteMany[\s\S]*productColor\.createMany/);
    expect(source).toMatch(/Missing occasion slug/);
    expect(source).toMatch(/Missing recipient slug/);
    expect(source).toMatch(/Missing color slug/);
    expect(source).toMatch(/ensureProductMedia/);
    expect(source).toMatch(/existingPrimary/);
  });

  it('seeds calendar holidays as Occasion.kind HOLIDAY separately from personal occasions', () => {
    expect(slugsIn(occasionsBody)).not.toContain('8-marta');
    expect(slugsIn(holidaysBody)).toContain('8-marta');
    expect(slugsIn(holidaysBody)).toContain('novyy-god');
    expect(source).toMatch(/upsertOccasion\(prisma, item, 'OCCASION'\)/);
    expect(source).toMatch(/upsertOccasion\(prisma, item, 'HOLIDAY'\)/);
  });

  it('sets compositionClass explicitly and recomputes Product.compositionKind', () => {
    expect(source).toContain("compositionClass: 'BLOOM'");
    expect(source).toContain("compositionClass: 'DECORATIVE'");
    expect(source).toContain('compositionClass: null');
    expect(source).toContain('deriveCompositionKind');
    expect(source).toContain('resolveStoredCompositionKind');
    expect(source).not.toMatch(/displayName:\s*component\.displayName/);
    expect(source).not.toMatch(/quantity:\s*component\.quantity/);
    expect(source).not.toMatch(/unit:\s*'STEM'/);
    expect(source).toContain('SEED_VARIANT');
  });

  it('derives MONO / MIXED / UNKNOWN including DECORATIVE and unclassified types', () => {
    const classes = parseFlowerTypeClasses();
    expect(classes.get('evkalipt')).toBe('DECORATIVE');
    expect(classes.get('neizvestnyy')).toBeNull();

    const expected: Record<string, 'MONO' | 'MIXED' | 'UNKNOWN'> = {
      ameli: 'MIXED',
      miya: 'MIXED',
      oblako: 'MONO',
      'chernovik-unknown': 'UNKNOWN',
      nezhnost: 'MIXED',
      romans: 'MONO',
      vesna: 'MONO',
      tiffany: 'MONO',
      pionovyy: 'MONO',
      lavanda: 'MIXED',
      solntse: 'MIXED',
    };

    for (const [slug, kind] of Object.entries(expected)) {
      const rows = componentSlugsForBouquet(slug).map((typeSlug) => ({
        typeId: typeSlug,
        compositionClass: classes.get(typeSlug) ?? null,
      }));
      const derived = deriveCompositionKind(rows);
      expect(resolveStoredCompositionKind('BOUQUET', derived)).toBe(kind);
    }
  });

  it('binds FIXED promo via mapNamedFixedSalesToVariantIds (name→id), never bySort', () => {
    expect(source).toContain("S: { name: '7 шт'");
    expect(source).toContain("M: { name: '15 шт'");
    expect(source).toContain("L: { name: '25 шт'");
    expect(source).toContain('mapNamedFixedSalesToVariantIds');
    expect(source).toContain('SEED_VARIANT.S.name');
    expect(source).not.toMatch(/byName\.get\('S'\)/);
    expect(source).not.toMatch(/bySort\.get\(/);
  });
});

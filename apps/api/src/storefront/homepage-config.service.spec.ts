import { BadRequestException } from '@nestjs/common';
import { defaultHomepageConfig } from '@bouquet-one/contracts';
import {
  migrateLegacyHomepageConfig,
  parseHomepageConfig,
} from './homepage-config.service';

/** Pre-destination production-shaped payload (href strings only, no kind+id). */
const LEGACY_HOMEPAGE_CONFIG = {
  hero: {
    title: 'Букеты с доставкой',
    subtitle: 'Свежие цветы',
    imageUrl: '/media/hero.jpg',
    ctaLabel: 'В каталог',
    ctaHref: '/catalog/bouquets',
  },
  heroSlides: [
    {
      id: 'main',
      title: 'Букеты с доставкой',
      subtitle: 'Свежие цветы',
      imageUrl: '/media/hero.jpg',
      mobileImageUrl: null,
      ctaLabel: 'В каталог',
      ctaHref: '/catalog/bouquets',
      enabled: true,
      sortOrder: 10,
      startsAt: null,
      endsAt: null,
    },
  ],
  sections: [
    {
      id: 'promotions',
      kind: 'promotions',
      enabled: true,
      heading: 'Акции',
      sortOrder: 10,
      viewAllHref: '/akcii',
      limit: 8,
    },
    {
      id: 'popular',
      kind: 'popular',
      enabled: true,
      heading: 'Популярные',
      sortOrder: 20,
      viewAllHref: '/catalog/bouquets',
      sourceSlug: 'bukety',
      limit: 10,
    },
    {
      id: 'roses',
      kind: 'roses',
      enabled: true,
      heading: 'Розы',
      sortOrder: 30,
      viewAllHref: '/catalog/rozy',
      sourceSlug: 'rozy',
      limit: 5,
    },
  ],
  discoveryTiles: [
    {
      id: 'tile-1',
      label: 'Букеты',
      href: '/catalog/bouquets',
      imageUrl: '/categories/bouquets.png',
      imageAlt: 'Букеты',
      enabled: true,
      sortOrder: 10,
    },
    {
      id: 'tile-2',
      label: 'Розы',
      href: '/catalog/rozy',
      imageUrl: '/categories/roses.png',
      imageAlt: 'Розы',
      enabled: true,
      sortOrder: 20,
    },
  ],
  perks: [
    { id: 'perk-1', title: 'Доставка сегодня', enabled: true, sortOrder: 10 },
  ],
};

describe('homepage config parse/migrate', () => {
  it('read mode synthesizes heroSlides when key is missing (legacy)', () => {
    const migrated = migrateLegacyHomepageConfig(
      {
        hero: {
          title: 'Hero',
          subtitle: 'Sub',
          imageUrl: null,
          ctaLabel: 'Go',
          ctaHref: '/catalog/bouquets',
        },
        sections: [],
        discoveryTiles: [],
        perks: [],
      },
      'read',
    ) as { heroSlides: unknown[] };
    expect(migrated.heroSlides.length).toBeGreaterThan(0);
  });

  it('read mode keeps intentional empty heroSlides array (no resurrect)', () => {
    const migrated = migrateLegacyHomepageConfig(
      {
        hero: {
          title: 'Hero',
          subtitle: 'Sub',
          imageUrl: null,
          ctaLabel: 'Go',
          ctaHref: '/catalog/bouquets',
        },
        heroSlides: [],
        sections: [],
        discoveryTiles: [],
        perks: [],
      },
      'read',
    ) as { heroSlides: unknown[] };
    expect(migrated.heroSlides).toEqual([]);
  });

  it('write mode keeps intentional empty heroSlides and allows save', () => {
    const migrated = migrateLegacyHomepageConfig(
      {
        hero: {
          title: 'Hero',
          subtitle: 'Sub',
          imageUrl: null,
          ctaLabel: 'Go',
          ctaHref: '/catalog/bouquets',
        },
        heroSlides: [],
        sections: [{ id: 'popular', kind: 'popular', enabled: true, heading: 'Pop', sortOrder: 10 }],
        discoveryTiles: [],
        perks: [{ id: 'p1', title: 'Perk', enabled: true, sortOrder: 10 }],
      },
      'write',
    ) as { heroSlides: unknown[] };
    expect(migrated.heroSlides).toEqual([]);
    const parsed = parseHomepageConfig(
      {
        hero: {
          title: 'Hero',
          subtitle: 'Sub',
          imageUrl: null,
          ctaLabel: 'Go',
          ctaHref: '/catalog/bouquets',
        },
        heroSlides: [],
        sections: [
          { id: 'popular', kind: 'popular', enabled: true, heading: 'Pop', sortOrder: 10 },
        ],
        discoveryTiles: [],
        perks: [{ id: 'p1', title: 'Perk', enabled: true, sortOrder: 10 }],
      },
      'write',
    );
    expect(parsed.heroSlides).toEqual([]);
    expect(parsed.hero.title).toBe('Hero');
  });

  it('write mode does not force-add autumn/popular/roses after admin removal', () => {
    const migrated = migrateLegacyHomepageConfig(
      {
        ...defaultHomepageConfig(),
        sections: [
          { id: 'promotions', kind: 'promotions', enabled: true, heading: 'Акции', sortOrder: 10 },
        ],
      },
      'write',
    ) as { sections: Array<{ id: string }> };
    expect(migrated.sections.map((s) => s.id)).toEqual(['promotions']);
  });

  it('read mode does not resurrect sections deleted from stored config', () => {
    const stored = {
      ...LEGACY_HOMEPAGE_CONFIG,
      sections: LEGACY_HOMEPAGE_CONFIG.sections.filter((s) => s.id !== 'roses'),
    };
    const parsed = parseHomepageConfig(stored, 'read');
    expect(parsed.sections.map((s) => s.id)).toEqual(['promotions', 'popular']);
    expect(parsed.sections.find((s) => s.id === 'roses')).toBeUndefined();
    expect(parsed.sections.find((s) => s.id === 'autumn')).toBeUndefined();
  });

  it('deleted block stays gone across write then read (GET after save)', () => {
    const afterDelete = {
      ...LEGACY_HOMEPAGE_CONFIG,
      discoveryTiles: LEGACY_HOMEPAGE_CONFIG.discoveryTiles.filter((t) => t.id !== 'tile-2'),
      sections: LEGACY_HOMEPAGE_CONFIG.sections.filter((s) => s.id !== 'roses'),
    };
    const written = parseHomepageConfig(afterDelete, 'write');
    const reread = parseHomepageConfig(written, 'read');
    expect(reread.discoveryTiles.map((t) => t.id)).toEqual(['tile-1']);
    expect(reread.sections.map((s) => s.id)).toEqual(['promotions', 'popular']);
  });

  it('parses legacy production config without destinations/sources (compat)', () => {
    const parsed = parseHomepageConfig(LEGACY_HOMEPAGE_CONFIG, 'read');
    expect(parsed.heroSlides).toHaveLength(1);
    expect(parsed.heroSlides[0]?.ctaHref).toBe('/catalog/bouquets');
    expect(parsed.discoveryTiles).toHaveLength(2);
    expect(parsed.discoveryTiles[0]?.href).toBe('/catalog/bouquets');
    expect(parsed.discoveryTiles[0]?.imageUrl).toBe('/categories/bouquets.png');
    expect(parsed.sections).toHaveLength(3);
    expect(parsed.sections.find((s) => s.id === 'popular')?.sourceSlug).toBe('bukety');
    expect(parsed.perks).toHaveLength(1);
    // Round-trip write must not drop legacy fields
    const rewritten = parseHomepageConfig(parsed, 'write');
    expect(rewritten.discoveryTiles).toHaveLength(2);
    expect(rewritten.sections.map((s) => s.id).sort()).toEqual(
      ['popular', 'promotions', 'roses'].sort(),
    );
  });

  it('resolves catalog_page id to current slug on read without re-save', () => {
    const stored = {
      ...LEGACY_HOMEPAGE_CONFIG,
      discoveryTiles: [
        {
          id: 'tile-1',
          label: 'Букеты',
          href: '/catalog/old-bouquets',
          destination: {
            kind: 'catalog_page' as const,
            ref: 'page-1',
            href: '/catalog/old-bouquets',
          },
          imageUrl: '/categories/bouquets.png',
          imageAlt: 'Букеты',
          enabled: true,
          sortOrder: 10,
        },
      ],
      sections: [
        {
          id: 'popular',
          kind: 'popular' as const,
          enabled: true,
          heading: 'Популярные',
          sortOrder: 20,
          productSource: {
            kind: 'catalog_page' as const,
            id: 'page-1',
            slug: 'old-bouquets',
          },
          sourceSlug: 'old-bouquets',
          viewAllMode: 'auto' as const,
          viewAllHref: '/catalog/old-bouquets',
          limit: 10,
        },
      ],
    };
    const parsed = parseHomepageConfig(stored, 'read', {
      catalogSlugById: { 'page-1': 'bouquets' },
    });
    expect(parsed.discoveryTiles[0]?.href).toBe('/catalog/bouquets');
    expect(parsed.sections[0]?.sourceSlug).toBe('bouquets');
    expect(parsed.sections[0]?.viewAllHref).toBe('/catalog/bouquets');
  });

  it('resolves product destination id to current slug on read', () => {
    const base = defaultHomepageConfig();
    const parsed = parseHomepageConfig(
      {
        ...base,
        heroSlides: [
          {
            ...base.heroSlides[0]!,
            ctaHref: '/products/old-slug',
            ctaDestination: {
              kind: 'product',
              ref: 'prod-1',
              href: '/products/old-slug',
            },
          },
        ],
      },
      'read',
      { productSlugById: { 'prod-1': 'new-slug' } },
    );
    expect(parsed.heroSlides[0]?.ctaHref).toBe('/products/new-slug');
  });

  it('allows deleting a discovery tile and saving the rest', () => {
    const base = defaultHomepageConfig();
    const tiles = base.discoveryTiles.slice(1);
    const parsed = parseHomepageConfig(
      {
        ...base,
        discoveryTiles: tiles,
      },
      'write',
    );
    expect(parsed.discoveryTiles).toHaveLength(tiles.length);
  });

  it('allows empty slide subtitle when deriving primary hero', () => {
    const base = defaultHomepageConfig();
    const slides = [
      {
        ...base.heroSlides[0]!,
        subtitle: '',
        ctaDestination: { kind: 'system' as const, ref: 'bouquets', href: '/catalog/bouquets' },
      },
    ];
    const parsed = parseHomepageConfig(
      {
        ...base,
        hero: { ...base.hero, subtitle: '' },
        heroSlides: slides,
      },
      'write',
    );
    expect(parsed.hero.subtitle.trim().length).toBeGreaterThanOrEqual(0);
    expect(parsed.heroSlides[0]?.subtitle).toBe('');
  });

  it('rejects enabled tile without image', () => {
    const base = defaultHomepageConfig();
    expect(() =>
      parseHomepageConfig(
        {
          ...base,
          discoveryTiles: [
            {
              ...base.discoveryTiles[0]!,
              imageUrl: '',
              enabled: true,
            },
          ],
        },
        'write',
      ),
    ).toThrow(BadRequestException);
  });

  it('hides (disabled) tile may omit image', () => {
    const base = defaultHomepageConfig();
    const parsed = parseHomepageConfig(
      {
        ...base,
        discoveryTiles: [
          {
            ...base.discoveryTiles[0]!,
            imageUrl: '',
            enabled: false,
          },
          ...base.discoveryTiles.slice(1),
        ],
      },
      'write',
    );
    expect(parsed.discoveryTiles[0]?.enabled).toBe(false);
  });

  it('resolves ctaDestination into ctaHref on write', () => {
    const base = defaultHomepageConfig();
    const parsed = parseHomepageConfig(
      {
        ...base,
        heroSlides: [
          {
            ...base.heroSlides[0]!,
            ctaHref: '/old',
            ctaDestination: { kind: 'system', ref: 'stems', href: '/catalog/stems' },
          },
        ],
      },
      'write',
    );
    expect(parsed.heroSlides[0]?.ctaHref).toBe('/catalog/stems');
  });

  it('allows hiding a shelf and deleting another without reinflating defaults', () => {
    const base = defaultHomepageConfig();
    const shelves = base.sections.filter((s) =>
      ['promotions', 'autumn', 'popular', 'bestsellers', 'roses'].includes(s.kind),
    );
    expect(shelves.length).toBeGreaterThan(1);
    const [first, ...rest] = shelves;
    const kept = rest.map((s, i) => (i === 0 ? { ...s, enabled: false } : s));
    const other = base.sections.filter((s) => !shelves.some((x) => x.id === s.id));
    const parsed = parseHomepageConfig(
      {
        ...base,
        sections: [...kept, ...other],
      },
      'write',
    );
    expect(parsed.sections.find((s) => s.id === first!.id)).toBeUndefined();
    expect(parsed.sections.find((s) => s.id === kept[0]!.id)?.enabled).toBe(false);
  });

  it('creates a new shelf with productSource and auto view-all', () => {
    const base = defaultHomepageConfig();
    const parsed = parseHomepageConfig(
      {
        ...base,
        sections: [
          ...base.sections,
          {
            id: 'popular-extra',
            kind: 'popular',
            enabled: true,
            heading: 'Ещё популярное',
            sortOrder: 35,
            productSource: { kind: 'catalog_page', id: null, slug: 'bouquets' },
            sourceSlug: 'bouquets',
            viewAllMode: 'auto',
            viewAllHref: null,
            limit: 8,
          },
        ],
      },
      'write',
    );
    const created = parsed.sections.find((s) => s.id === 'popular-extra');
    expect(created?.sourceSlug).toBe('bouquets');
    expect(created?.viewAllHref).toBe('/catalog/bouquets');
    expect(created?.productSource?.kind).toBe('catalog_page');
  });

  it('rejects invalid external view-all URL', () => {
    const base = defaultHomepageConfig();
    const target = base.sections.find((s) => s.kind === 'popular') ?? base.sections[0]!;
    expect(() =>
      parseHomepageConfig(
        {
          ...base,
          sections: base.sections.map((s) =>
            s.id === target.id
              ? {
                  ...s,
                  viewAllMode: 'destination' as const,
                  viewAllHref: 'javascript:alert(1)',
                  viewAllDestination: {
                    kind: 'custom' as const,
                    href: 'javascript:alert(1)',
                  },
                }
              : s,
          ),
        },
        'write',
      ),
    ).toThrow(BadRequestException);
  });
});

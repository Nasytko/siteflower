import { derivePriceRange } from '@bouquet-one/contracts';
import {
  activeVariantPrices,
  isEffectivelyPublished,
  validatePublishRequirements,
  wouldCreateRedirectLoop,
} from './catalog.logic';

const publishReady = {
  name: 'Нежность',
  slug: 'nezhnost',
  shortDescription: '15 роз в упаковке',
  description: 'Букет из 15 роз с доставкой по Гродно.',
  variants: [{ status: 'ACTIVE', priceMinor: 9900n }],
  hasPrimaryImage: true,
};

describe('isEffectivelyPublished', () => {
  it('rejects drafts', () => {
    expect(
      isEffectivelyPublished({
        lifecycle: 'DRAFT',
        publishAt: null,
        publishedAt: new Date(),
        unpublishAt: null,
      }),
    ).toBe(false);
  });

  it('respects a future publishAt', () => {
    expect(
      isEffectivelyPublished({
        lifecycle: 'PUBLISHED',
        publishAt: new Date(Date.now() + 86_400_000),
        publishedAt: new Date(),
        unpublishAt: null,
      }),
    ).toBe(false);
  });

  it('respects an elapsed unpublishAt', () => {
    expect(
      isEffectivelyPublished({
        lifecycle: 'PUBLISHED',
        publishAt: new Date(Date.now() - 86_400_000),
        publishedAt: null,
        unpublishAt: new Date(Date.now() - 1000),
      }),
    ).toBe(false);
  });

  it('accepts an open schedule window', () => {
    expect(
      isEffectivelyPublished({
        lifecycle: 'PUBLISHED',
        publishAt: new Date(Date.now() - 1000),
        publishedAt: new Date(Date.now() - 1000),
        unpublishAt: new Date(Date.now() + 86_400_000),
      }),
    ).toBe(true);
  });
});

describe('validatePublishRequirements', () => {
  it('passes a complete product', () => {
    expect(validatePublishRequirements(publishReady)).toEqual([]);
  });

  it('reports every missing requirement', () => {
    const issues = validatePublishRequirements({
      name: '',
      slug: '',
      shortDescription: null,
      description: null,
      variants: [],
      hasPrimaryImage: false,
    });
    expect(issues.map((issue) => issue.code)).toEqual([
      'NAME_REQUIRED',
      'SLUG_REQUIRED',
      'SHORT_DESCRIPTION_REQUIRED',
      'DESCRIPTION_REQUIRED',
      'VARIANT_REQUIRED',
      'PRIMARY_IMAGE_REQUIRED',
    ]);
  });

  it('requires an active variant, not just any variant', () => {
    const issues = validatePublishRequirements({
      ...publishReady,
      variants: [{ status: 'INACTIVE', priceMinor: 9900n }],
    });
    expect(issues.map((issue) => issue.code)).toEqual(['VARIANT_REQUIRED']);
  });

  it('requires a primary image', () => {
    const issues = validatePublishRequirements({ ...publishReady, hasPrimaryImage: false });
    expect(issues.map((issue) => issue.code)).toEqual(['PRIMARY_IMAGE_REQUIRED']);
  });
});

describe('wouldCreateRedirectLoop', () => {
  it('rejects a self redirect', () => {
    expect(wouldCreateRedirectLoop([], 'roses', 'roses')).toBe(true);
  });

  it('rejects a two-hop cycle', () => {
    expect(wouldCreateRedirectLoop([{ fromSlug: 'b', toSlug: 'a' }], 'a', 'b')).toBe(true);
  });

  it('rejects a longer cycle', () => {
    expect(
      wouldCreateRedirectLoop(
        [
          { fromSlug: 'b', toSlug: 'c' },
          { fromSlug: 'c', toSlug: 'a' },
        ],
        'a',
        'b',
      ),
    ).toBe(true);
  });

  it('allows a fresh redirect', () => {
    expect(wouldCreateRedirectLoop([{ fromSlug: 'old', toSlug: 'new' }], 'new', 'newer')).toBe(
      false,
    );
  });
});

describe('price derivation', () => {
  it('returns null without active variants', () => {
    expect(activeVariantPrices('BYN', [{ status: 'INACTIVE', priceMinor: 9900n }])).toBeNull();
  });

  it('labels a single price', () => {
    expect(
      activeVariantPrices('BYN', [
        { status: 'ACTIVE', priceMinor: 9900n },
        { status: 'INACTIVE', priceMinor: 100n },
      ]),
    ).toEqual({
      currency: 'BYN',
      minMinor: '9900',
      maxMinor: '9900',
      single: true,
      label: '99,00 BYN',
    });
  });

  it('labels a range from the lowest active price', () => {
    expect(
      activeVariantPrices('BYN', [
        { status: 'ACTIVE', priceMinor: 19_900n },
        { status: 'ACTIVE', priceMinor: 9900n },
      ]),
    ).toEqual({
      currency: 'BYN',
      minMinor: '9900',
      maxMinor: '19900',
      single: false,
      label: 'от 99,00 BYN',
    });
  });

  it('pads minor units below one unit', () => {
    expect(derivePriceRange('BYN', [5n])?.label).toBe('0,05 BYN');
  });
});
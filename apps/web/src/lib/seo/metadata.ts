/**
 * Centralized SEO helpers for the storefront.
 * Entity-specific metadata (Product, Category, etc.) should call these helpers
 * rather than assembling Metadata objects ad hoc.
 */

import type { Metadata } from 'next';
import { getIndexingPolicy } from './indexing';
import { absoluteUrl, getSiteUrl } from './site-url';

export type PageSeoInput = {
  title: string;
  description: string;
  path?: string;
  imageUrl?: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
};

const BRAND = 'BUKET №1';

/** Ensure the brand appears once in the document title. */
export function withBrandTitle(title: string): string {
  const trimmed = title.replace(/\s+/g, ' ').trim();
  if (!trimmed) return BRAND;
  if (/BUKET\s*№\s*1/i.test(trimmed) || /Букет\s*(№|номер)\s*(1|один)/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} | ${BRAND}`;
}

export function buildRootMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  const indexing = getIndexingPolicy();

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: BRAND,
      // Pages pass absolute titles via buildPageMetadata (brand once).
      template: '%s',
    },
    description:
      'Выберите букет или цветы поштучно в BUKET №1. Бесплатная доставка в черте Гродно.',
    applicationName: BRAND,
    authors: [{ name: BRAND }],
    creator: BRAND,
    publisher: BRAND,
    robots: indexing.robots,
    openGraph: {
      type: 'website',
      locale: 'ru_BY',
      siteName: BRAND,
      url: siteUrl,
      title: BRAND,
      description: 'Цветочный магазин в Гродно с доставкой букетов и цветов поштучно.',
    },
    twitter: {
      card: 'summary_large_image',
      title: BRAND,
      description: 'Цветочный магазин в Гродно с доставкой букетов и цветов поштучно.',
    },
    alternates: {
      canonical: '/',
    },
    icons: {
      icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/brand/logo.png' }],
      apple: '/brand/logo.png',
    },
  };
}

export function buildPageMetadata(input: PageSeoInput): Metadata {
  const indexing = getIndexingPolicy();
  const canonicalPath = input.path ?? '/';
  const canonical = absoluteUrl(canonicalPath);
  const shouldIndex = indexing.allowIndexing && !input.noIndex;
  const title = withBrandTitle(input.title);

  return {
    title: { absolute: title },
    description: input.description,
    robots: shouldIndex
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
    alternates: {
      canonical,
    },
    openGraph: {
      type: input.type ?? 'website',
      locale: 'ru_BY',
      siteName: BRAND,
      url: canonical,
      title,
      description: input.description,
      ...(input.imageUrl
        ? {
            images: [{ url: input.imageUrl }],
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: input.description,
      ...(input.imageUrl ? { images: [input.imageUrl] } : {}),
    },
  };
}

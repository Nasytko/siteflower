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

export function buildRootMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  const indexing = getIndexingPolicy();

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: 'БУКЕТ №1',
      template: '%s · БУКЕТ №1',
    },
    description: 'Цветочный магазин в Гродно. Современная платформа доставки букетов.',
    applicationName: 'БУКЕТ №1',
    authors: [{ name: 'БУКЕТ №1' }],
    creator: 'БУКЕТ №1',
    publisher: 'БУКЕТ №1',
    robots: indexing.robots,
    openGraph: {
      type: 'website',
      locale: 'ru_BY',
      siteName: 'БУКЕТ №1',
      url: siteUrl,
      title: 'БУКЕТ №1',
      description: 'Цветочный магазин в Гродно.',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'БУКЕТ №1',
      description: 'Цветочный магазин в Гродно.',
    },
    alternates: {
      canonical: '/',
    },
  };
}

export function buildPageMetadata(input: PageSeoInput): Metadata {
  const indexing = getIndexingPolicy();
  const canonicalPath = input.path ?? '/';
  const canonical = absoluteUrl(canonicalPath);
  const shouldIndex = indexing.allowIndexing && !input.noIndex;

  return {
    title: input.title,
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
      siteName: 'БУКЕТ №1',
      url: canonical,
      title: input.title,
      description: input.description,
      ...(input.imageUrl
        ? {
            images: [{ url: input.imageUrl }],
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      ...(input.imageUrl ? { images: [input.imageUrl] } : {}),
    },
  };
}

/**
 * Storefront entity path map:
 *
 * Home           → `/`
 * Catalog        → `/bukety` (filtered URLs: same canonical, noIndex true)
 * Product        → `/bukety/${slug}`
 * Collection     → `/collections/${slug}`
 * Occasion       → `/povod/${slug}`
 * Recipient      → `/komu/${slug}`
 * Flower         → `/cvety/${slug}`
 * Delivery/About → `/dostavka`, `/o-nas`
 * Favorites      → `/favorites` (disallow in robots; client-only)
 *
 * Always:
 * - resolve canonical from the public SITE URL, never from the request Host header alone
 * - honor getIndexingPolicy() so non-production stays noindex
 * - keep commercial fields server-rendered for SEO
 */

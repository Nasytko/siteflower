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
      default: 'BUKET №1',
      template: '%s · BUKET №1',
    },
    description: 'Цветочный магазин в Гродно. Современная платформа доставки букетов.',
    applicationName: 'BUKET №1',
    authors: [{ name: 'BUKET №1' }],
    creator: 'BUKET №1',
    publisher: 'BUKET №1',
    robots: indexing.robots,
    openGraph: {
      type: 'website',
      locale: 'ru_BY',
      siteName: 'BUKET №1',
      url: siteUrl,
      title: 'BUKET №1',
      description: 'Цветочный магазин в Гродно.',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'BUKET №1',
      description: 'Цветочный магазин в Гродно.',
    },
    alternates: {
      canonical: '/',
    },
    icons: {
      icon: '/brand/logo.png',
      apple: '/brand/logo.png',
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
      siteName: 'BUKET №1',
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
 * Promotions     → `/akcii`
 * Flower hub     → `/cvety`, flower landing → `/cvety/${slug}`
 * Occasion hub   → `/povod`, occasion landing → `/povod/${slug}`
 * Recipient      → `/komu/${slug}`
 * Delivery/About → `/dostavka`, `/o-nas`
 * Favorites      → `/favorites` (disallow in robots; client-only)
 *
 * Always:
 * - resolve canonical from the public SITE URL, never from the request Host header alone
 * - honor getIndexingPolicy() so non-production stays noindex
 * - keep commercial fields server-rendered for SEO
 */

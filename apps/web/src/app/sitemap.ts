import type { MetadataRoute } from 'next';
import { getSitemapEntries } from '@/lib/public-api';
import { getIndexingPolicy } from '@/lib/seo/indexing';
import { getSiteUrl } from '@/lib/seo/site-url';

const STATIC_PATHS = [
  '/',
  '/catalog',
  '/catalog/bouquets',
  '/catalog/rose-bouquets',
  '/catalog/stems',
  '/akcii',
  '/povod',
  '/dostavka',
  '/o-nas',
  '/kontakty',
  '/oferta',
  '/vozvrat',
  '/privacy',
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const indexing = getIndexingPolicy();
  if (!indexing.allowIndexing) {
    return [];
  }

  const siteUrl = getSiteUrl();
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: path === '/' ? `${siteUrl}/` : `${siteUrl}${path}`,
    changeFrequency:
      path === '/' || path === '/catalog' || path === '/catalog/bouquets' || path === '/akcii'
        ? 'daily'
        : 'weekly',
    priority:
      path === '/'
        ? 1
        : path === '/catalog' || path === '/catalog/bouquets' || path === '/catalog/rose-bouquets'
          ? 0.9
          : path === '/akcii'
            ? 0.8
            : 0.6,
  }));

  let dynamicEntries: MetadataRoute.Sitemap = [];
  try {
    const entries = await getSitemapEntries();
    dynamicEntries = entries
      .filter((entry) => !entry.noIndex)
      .map((entry) => ({
        url: `${siteUrl}${entry.path.startsWith('/') ? entry.path : `/${entry.path}`}`,
        ...(entry.updatedAt ? { lastModified: new Date(entry.updatedAt) } : {}),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
  } catch (error) {
    console.error('[sitemap] Failed to load dynamic catalog entries from API', error);
    // Keep static hubs so robots still see core URLs; failure is visible in logs.
  }

  const byUrl = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const entry of [...staticEntries, ...dynamicEntries]) {
    const existing = byUrl.get(entry.url);
    if (!existing) {
      byUrl.set(entry.url, entry);
      continue;
    }
    const existingTime = existing.lastModified ? new Date(existing.lastModified).getTime() : 0;
    const nextTime = entry.lastModified ? new Date(entry.lastModified).getTime() : 0;
    if (nextTime > existingTime) {
      byUrl.set(entry.url, {
        ...existing,
        lastModified: entry.lastModified,
      });
    }
  }

  return Array.from(byUrl.values());
}

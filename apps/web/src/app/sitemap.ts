import type { MetadataRoute } from 'next';
import { getSitemapEntries } from '@/lib/public-api';
import { getIndexingPolicy } from '@/lib/seo/indexing';
import { getSiteUrl } from '@/lib/seo/site-url';

const STATIC_PATHS = ['/', '/bukety', '/dostavka', '/o-nas'] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const indexing = getIndexingPolicy();
  if (!indexing.allowIndexing) {
    return [];
  }

  const siteUrl = getSiteUrl();
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: path === '/' ? `${siteUrl}/` : `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/' || path === '/bukety' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : path === '/bukety' ? 0.9 : 0.6,
  }));

  let dynamicEntries: MetadataRoute.Sitemap = [];
  try {
    const entries = await getSitemapEntries();
    dynamicEntries = entries
      .filter((entry) => !entry.noIndex)
      .map((entry) => ({
        url: `${siteUrl}${entry.path.startsWith('/') ? entry.path : `/${entry.path}`}`,
        lastModified: entry.updatedAt ? new Date(entry.updatedAt) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
  } catch {
    dynamicEntries = [];
  }

  // Prefer API updatedAt for static paths when present; avoid duplicates
  const byUrl = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const entry of [...staticEntries, ...dynamicEntries]) {
    const existing = byUrl.get(entry.url);
    if (!existing) {
      byUrl.set(entry.url, entry);
      continue;
    }
    // Keep earlier (static) priority/changefreq but use newer lastModified when available
    const existingTime = existing.lastModified ? new Date(existing.lastModified).getTime() : 0;
    const nextTime = entry.lastModified ? new Date(entry.lastModified).getTime() : 0;
    if (nextTime > existingTime) {
      byUrl.set(entry.url, { ...existing, lastModified: entry.lastModified });
    }
  }

  return Array.from(byUrl.values());
}

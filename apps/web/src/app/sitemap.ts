import type { MetadataRoute } from 'next';
import { getSitemapEntries } from '@/lib/public-api';
import { getIndexingPolicy } from '@/lib/seo/indexing';
import { getSiteUrl } from '@/lib/seo/site-url';

/** Always-public legal / info pages — not catalog-managed. */
const STATIC_PATHS = [
  '/',
  '/dostavka',
  '/o-nas',
  '/kontakty',
  '/oferta',
  '/vozvrat',
  '/privacy',
] as const;

/**
 * Catalog hubs used only when the API sitemap is unavailable.
 * Do NOT list SYSTEM_HUB / LEGACY / thematic category slugs here — those must
 * respect visibility / noIndex from `getSitemap()` (avoids leaking hidden pages).
 */
const FALLBACK_HUB_PATHS = [
  '/catalog',
  '/catalog/bouquets',
  '/akcii',
  '/povod',
  '/k-prazdniku',
  '/komu',
] as const;

function entryFor(
  siteUrl: string,
  path: string,
  opts?: { changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency']; priority?: number },
): MetadataRoute.Sitemap[number] {
  return {
    url: path === '/' ? `${siteUrl}/` : `${siteUrl}${path}`,
    changeFrequency: opts?.changeFrequency ?? 'weekly',
    priority: opts?.priority ?? 0.6,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const indexing = getIndexingPolicy();
  if (!indexing.allowIndexing) {
    return [];
  }

  const siteUrl = getSiteUrl();
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) =>
    entryFor(siteUrl, path, {
      changeFrequency: path === '/' ? 'daily' : 'weekly',
      priority: path === '/' ? 1 : 0.6,
    }),
  );

  let dynamicEntries: MetadataRoute.Sitemap = [];
  let apiOk = false;
  try {
    const entries = await getSitemapEntries();
    apiOk = true;
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
  }

  const hubFallback: MetadataRoute.Sitemap = apiOk
    ? []
    : FALLBACK_HUB_PATHS.map((path) =>
        entryFor(siteUrl, path, {
          changeFrequency:
            path === '/catalog' || path === '/catalog/bouquets' || path === '/akcii'
              ? 'daily'
              : 'weekly',
          priority:
            path === '/catalog' || path === '/catalog/bouquets'
              ? 0.9
              : path === '/akcii'
                ? 0.8
                : 0.6,
        }),
      );

  const byUrl = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const entry of [...staticEntries, ...hubFallback, ...dynamicEntries]) {
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

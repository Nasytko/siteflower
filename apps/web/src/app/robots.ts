import type { MetadataRoute } from 'next';
import { getIndexingPolicy } from '@/lib/seo/indexing';
import { getSiteUrl } from '@/lib/seo/site-url';

export default function robots(): MetadataRoute.Robots {
  const indexing = getIndexingPolicy();
  const siteUrl = getSiteUrl();

  if (!indexing.allowIndexing) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
      host: siteUrl,
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Filter query URLs (?flower=…) are handled via noindex metadata — robots cannot target query strings reliably.
      disallow: ['/admin', '/api', '/favorites', '/preview'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

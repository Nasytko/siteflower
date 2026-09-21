import type { Metadata } from 'next';

export type IndexingPolicy = {
  allowIndexing: boolean;
  robots: Metadata['robots'];
};

/**
 * Environment-aware indexing.
 *
 * - Non-production: noindex unless ALLOW_INDEXING=true (explicit opt-in for rare preview cases)
 * - Production: index by default; set ALLOW_INDEXING=false only for deliberate holdbacks
 *
 * This prevents staging/dev noindex flags from silently disabling production SEO when
 * NODE_ENV=production, while still allowing non-prod environments to stay noindex.
 */
export function getIndexingPolicy(): IndexingPolicy {
  const nodeEnv = process.env.NODE_ENV;
  const flag = process.env.ALLOW_INDEXING;
  const allowIndexing =
    nodeEnv === 'production' ? flag !== 'false' : flag === 'true';

  return {
    allowIndexing,
    robots: allowIndexing
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
  };
}

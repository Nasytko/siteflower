/**
 * Fail fast when commerce fixtures are missing (common after integration suites wipe catalog).
 * Does not invent data — instructs to run the deterministic seed.
 */
import { request } from '@playwright/test';

const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001';

async function main() {
  const ctx = await request.newContext({ baseURL: apiUrl });
  const health = await ctx.get('/api/v1/health');
  if (!health.ok()) {
    throw new Error(`API health failed at ${apiUrl}/api/v1/health (${health.status()})`);
  }

  const product = await ctx.get('/api/v1/catalog/products/ameli');
  if (!product.ok()) {
    throw new Error(
      [
        `Commerce fixture missing: GET /api/v1/catalog/products/ameli → ${product.status()}.`,
        'Run: ALLOW_DEV_CATALOG_SEED=true pnpm seed:dev-catalog',
        'Then ensure fulfillment settings exist and API/web share the same DATABASE_URL.',
      ].join(' '),
    );
  }

  const body = (await product.json()) as {
    product?: { availability?: string; variants?: unknown[] };
  };
  if (body.product?.availability !== 'AVAILABLE' || !body.product.variants?.length) {
    throw new Error(
      'Fixture /bukety/ameli exists but is not orderable (need AVAILABLE + ≥1 variant). Re-seed.',
    );
  }

  const fulfillment = await ctx.get('/api/v1/checkout/fulfillment-options');
  if (!fulfillment.ok()) {
    throw new Error(`Fulfillment options unavailable (${fulfillment.status()})`);
  }

  await ctx.dispose();
}

export default main;

/**
 * CJS bridge for NestJS / Jest consumers.
 * Prisma 7 client is ESM; this wrapper exposes a sync-require entry that
 * lazily loads the ESM factory.
 */
let cached;

async function load() {
  if (!cached) {
    cached = await import('./dist/index.js');
  }
  return cached;
}

async function createPrismaClient(options) {
  const mod = await load();
  return mod.createPrismaClient(options);
}

module.exports = {
  createPrismaClient,
  get Prisma() {
    throw new Error('Import Prisma types from @bouquet-one/database ESM build / TypeScript source');
  },
};

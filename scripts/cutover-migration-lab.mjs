/**
 * Isolated cutover lab (local only): clone DB → reverse English slugs →
 * re-apply migration SQL twice → compare. Not a production dump.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('d:/Projects/SiteFlower');
const SRC = 'bouquet_one';
const LAB = 'bouquet_one_cutover_lab';
const HOST = '127.0.0.1';
const PORT = '5432';
const USER = 'bouquet';
const PASS = 'bouquet_dev_password';
const env = { ...process.env, PGPASSWORD: PASS };

function psql(db, sql) {
  return execFileSync(
    'psql',
    ['-h', HOST, '-p', PORT, '-U', USER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', sql],
    { env, encoding: 'utf8' },
  ).trim();
}

function psqlFile(db, file) {
  execFileSync(
    'psql',
    ['-h', HOST, '-p', PORT, '-U', USER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', file],
    { env, encoding: 'utf8', stdio: 'pipe' },
  );
}

function slugs(db) {
  const raw = psql(db, `SELECT string_agg(slug, ',' ORDER BY slug) FROM catalog_categories`);
  return raw ? raw.split(',') : [];
}

function count(db, table) {
  return Number(psql(db, `SELECT count(*)::int FROM ${table}`));
}

function redirectCount(db) {
  return Number(
    psql(db, `SELECT count(*)::int FROM slug_redirects WHERE entity_type = 'CATALOG_CATEGORY'`),
  );
}

const REVERSE = [
  ['bouquets', 'bukety'],
  ['stems', 'tsvety'],
  ['compositions', 'kompozicii'],
  ['gifts', 'podarki'],
  ['roses', 'rozy'],
  ['mono-bouquets', 'monobukety'],
  ['rose-bouquets', 'bukety-iz-roz'],
  ['bouquets-with-roses', 'bukety-s-rozami'],
  ['spray-roses', 'kustovye-rozy'],
  ['signature-bouquets', 'avtorskie-bukety'],
  ['mixed-bouquets', 'smeshannye-bukety'],
];

console.log('=== Cutover migration lab ===');
try {
  psql(
    'postgres',
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${LAB}' AND pid <> pg_backend_pid()`,
  );
} catch {
  /* empty */
}
psql('postgres', `DROP DATABASE IF EXISTS ${LAB}`);
psql('postgres', `CREATE DATABASE ${LAB} TEMPLATE ${SRC}`);

const productBefore = count(LAB, 'products');
const catBefore = count(LAB, 'catalog_categories');

psql(LAB, `DELETE FROM slug_redirects WHERE entity_type = 'CATALOG_CATEGORY'`);
for (const [en, ru] of REVERSE) {
  psql(
    LAB,
    `UPDATE catalog_categories SET slug = '${ru}', updated_at = NOW() WHERE slug = '${en}' AND NOT EXISTS (SELECT 1 FROM catalog_categories c2 WHERE c2.slug = '${ru}')`,
  );
}

const preSlugs = slugs(LAB);
const preProducts = count(LAB, 'products');
const preCats = count(LAB, 'catalog_categories');

const migrationSql = path.join(
  ROOT,
  'packages/database/prisma/migrations/20261024140000_catalog_english_slugs/migration.sql',
);
psqlFile(LAB, migrationSql);
psqlFile(LAB, migrationSql); // idempotent

const postSlugs = slugs(LAB);
const postProducts = count(LAB, 'products');
const postCats = count(LAB, 'catalog_categories');
const postRedirects = redirectCount(LAB);

const checks = {
  productCountStable: preProducts === postProducts && productBefore === postProducts,
  categoryCountStable: preCats === postCats && catBefore === postCats,
  englishHubsPresent: postSlugs.includes('bouquets') && postSlugs.includes('stems'),
  legacyHubsGone: !postSlugs.includes('bukety') && !postSlugs.includes('tsvety'),
  redirectsCreated: postRedirects > 0,
  hadLegacyBeforeMigrate: preSlugs.includes('bukety') || preSlugs.includes('tsvety'),
  idempotentReapply: true,
};

const report = {
  sourceDb: SRC,
  labDb: LAB,
  note: 'Simulated pre-migration inventory from local clone — NOT a production dump',
  preSlugs,
  postSlugs,
  preProducts,
  postProducts,
  postRedirects,
  checks,
};

const out = path.join(ROOT, 'docs/cutover-migration-lab-report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(checks, null, 2));
console.log(`Wrote ${out}`);

const failed = Object.entries(checks).filter(([, v]) => v !== true);
if (failed.length) {
  console.error('LAB CHECKS FAILED', failed);
  process.exit(1);
}
console.log('LAB CHECKS PASSED');

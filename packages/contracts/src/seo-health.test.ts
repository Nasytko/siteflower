import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeProductSeo,
  analyzeTaxonomySeo,
  summarizeEntityHealth,
  type ProductSeoAnalysisInput,
  type TaxonomySeoAnalysisInput,
} from './seo-health';

function baseProduct(overrides: Partial<ProductSeoAnalysisInput> = {}): ProductSeoAnalysisInput {
  return {
    id: 'p1',
    name: 'Нежность',
    slug: 'nezhnost',
    lifecycle: 'PUBLISHED',
    effectivelyPublished: true,
    noIndex: false,
    seoTitle: null,
    seoDescription: null,
    resolvedTitle: 'Букет «Нежность» с доставкой по Гродно | BUKET №1',
    resolvedDescription: 'Закажите букет «Нежность» в BUKET №1 — доставка цветов по Гродно.',
    hasPrimaryMedia: true,
    mediaCount: 1,
    mediaMissingAlt: 0,
    hasPrice: true,
    jsonLdReady: true,
    path: '/bukety/nezhnost',
    adminHref: '/admin/catalog/products/p1',
    inSitemap: true,
    ...overrides,
  };
}

test('automatic title → PASS', () => {
  const health = analyzeProductSeo(baseProduct());
  const title = health.checks.find((c) => c.title === 'Заголовок страницы');
  assert.equal(title?.severity, 'PASS');
  assert.match(title?.message ?? '', /автоматически/);
});

test('manual title → PASS', () => {
  const health = analyzeProductSeo(
    baseProduct({
      seoTitle: 'Букет Нежность Гродно',
      resolvedTitle: 'Букет Нежность Гродно',
    }),
  );
  const title = health.checks.find((c) => c.title === 'Заголовок страницы');
  assert.equal(title?.severity, 'PASS');
  assert.match(title?.message ?? '', /вручную/);
});

test('missing resolved title → CRITICAL when live', () => {
  const health = analyzeProductSeo(baseProduct({ resolvedTitle: '' }));
  assert.equal(health.status, 'attention');
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_TITLE_MISSING' && c.severity === 'CRITICAL'));
});

test('automatic description → PASS', () => {
  const health = analyzeProductSeo(baseProduct());
  const desc = health.checks.find((c) => c.title === 'Описание страницы');
  assert.equal(desc?.severity, 'PASS');
});

test('missing description → WARNING when live', () => {
  const health = analyzeProductSeo(baseProduct({ resolvedDescription: '' }));
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_DESCRIPTION_MISSING' && c.severity === 'WARNING'));
});

test('long title → WARNING', () => {
  const long = 'А'.repeat(80);
  const health = analyzeProductSeo(baseProduct({ resolvedTitle: long, seoTitle: long }));
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_TITLE_LONG' && c.severity === 'WARNING'));
});

test('long description → WARNING', () => {
  const long = 'Б'.repeat(200);
  const health = analyzeProductSeo(baseProduct({ resolvedDescription: long }));
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_DESCRIPTION_LONG'));
});

test('noIndex published product → CRITICAL', () => {
  const health = analyzeProductSeo(baseProduct({ noIndex: true }));
  assert.equal(health.status, 'attention');
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_NOINDEX' && c.severity === 'CRITICAL'));
  assert.match(health.indexabilityLabel, /скрыта от поисковых/);
});

test('draft product → SEO not critical for noIndex', () => {
  const health = analyzeProductSeo(
    baseProduct({
      lifecycle: 'DRAFT',
      effectivelyPublished: false,
      noIndex: true,
      mediaCount: 0,
      hasPrimaryMedia: false,
      hasPrice: false,
      jsonLdReady: false,
      inSitemap: false,
    }),
  );
  assert.notEqual(health.status, 'attention');
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_NOT_LIVE'));
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_NOINDEX' && c.severity === 'INFO'));
});

test('missing primary image → WARNING', () => {
  const health = analyzeProductSeo(
    baseProduct({ mediaCount: 2, hasPrimaryMedia: false }),
  );
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_PRIMARY_MEDIA_MISSING'));
});

test('missing alt → WARNING', () => {
  const health = analyzeProductSeo(baseProduct({ mediaMissingAlt: 2 }));
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_MEDIA_ALT_MISSING' && c.severity === 'WARNING'));
});

test('valid canonical → PASS', () => {
  const health = analyzeProductSeo(baseProduct());
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_CANONICAL' && c.severity === 'PASS'));
});

test('missing sitemap entry → CRITICAL', () => {
  const health = analyzeProductSeo(baseProduct({ inSitemap: false }));
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_SITEMAP_MISSING' && c.severity === 'CRITICAL'));
});

test('valid Product JSON-LD → PASS', () => {
  const health = analyzeProductSeo(baseProduct({ jsonLdReady: true }));
  assert.ok(health.checks.some((c) => c.code === 'PRODUCT_JSONLD_OK' && c.severity === 'PASS'));
});

test('taxonomy automatic metadata → status good', () => {
  const input: TaxonomySeoAnalysisInput = {
    id: 'f1',
    entityType: 'flower',
    name: 'Розы',
    slug: 'rozy',
    visibility: 'VISIBLE',
    description: 'Свежие розы с доставкой по Гродно',
    noIndex: false,
    seoTitle: null,
    seoDescription: null,
    resolvedTitle: 'Розы | BUKET №1',
    resolvedDescription: 'Свежие розы с доставкой по Гродно',
    path: '/cvety/rozy',
    adminHref: '/admin/catalog/flowers',
    inSitemap: true,
    hasPublicLanding: true,
  };
  const health = analyzeTaxonomySeo(input);
  assert.equal(health.status, 'good');
  assert.ok(health.checks.some((c) => c.code === 'TAXONOMY_TITLE_OK'));
});

test('taxonomy missing description content → WARNING', () => {
  const health = analyzeTaxonomySeo({
    id: 'f2',
    entityType: 'flower',
    name: 'Розы',
    slug: 'rozy',
    visibility: 'VISIBLE',
    description: null,
    noIndex: false,
    seoTitle: null,
    seoDescription: null,
    resolvedTitle: 'Розы | BUKET №1',
    resolvedDescription: 'Розы — доставка цветов по Гродно | BUKET №1',
    path: '/cvety/rozy',
    adminHref: '/admin/catalog/flowers',
    inSitemap: true,
    hasPublicLanding: true,
  });
  assert.ok(health.checks.some((c) => c.code === 'TAXONOMY_CONTENT_THIN'));
  assert.equal(health.status, 'improve');
});

test('color without landing is informational', () => {
  const health = analyzeTaxonomySeo({
    id: 'c1',
    entityType: 'color',
    name: 'Красный',
    slug: 'krasnyy',
    visibility: 'VISIBLE',
    description: null,
    noIndex: false,
    seoTitle: null,
    seoDescription: null,
    resolvedTitle: 'Красный | BUKET №1',
    resolvedDescription: 'Красный — доставка цветов по Гродно | BUKET №1',
    path: null,
    adminHref: '/admin/catalog/colors',
    inSitemap: false,
    hasPublicLanding: false,
  });
  assert.ok(health.checks.some((c) => c.code === 'TAXONOMY_NO_LANDING'));
  assert.equal(health.status, 'good');
});

test('summarizeEntityHealth counts statuses', () => {
  const good = analyzeProductSeo(baseProduct());
  const bad = analyzeProductSeo(baseProduct({ noIndex: true }));
  const summary = summarizeEntityHealth([good, bad]);
  assert.equal(summary.total, 2);
  assert.equal(summary.attention, 1);
  assert.equal(summary.good, 1);
});

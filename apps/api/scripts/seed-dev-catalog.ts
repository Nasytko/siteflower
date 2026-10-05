#!/usr/bin/env node
/**
 * Development-only catalog seed — idempotent upserts by known slugs.
 *
 * Safety gates (all must pass):
 *   - NODE_ENV !== 'production'
 *   - ALLOW_DEV_CATALOG_SEED=true
 *   - DATABASE_URL does not look like a production hostname
 *
 * Usage (from repo root):
 *   ALLOW_DEV_CATALOG_SEED=true pnpm seed:dev-catalog
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { config } from 'dotenv';
import sharp from 'sharp';
import { defaultHomepageConfig, defaultTimeWindows } from '@bouquet-one/contracts';
import { createPrismaClient, type PrismaClient } from '@bouquet-one/database';

// Capture BEFORE dotenv so a checked-in/local `.env` cannot silently enable seeding.
const allowDevCatalogSeedExplicit = process.env.ALLOW_DEV_CATALOG_SEED === 'true';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

const SINGLETON_ID = 1;

const PRODUCTION_HOST_HINTS = [
  'prod',
  'production',
  'rds.amazonaws.com',
  'azure.com',
  'neon.tech',
  'supabase.co',
  'digitalocean.com',
  'render.com',
  'railway.app',
  'planetscale',
  'cockroachlabs.cloud',
];

type TaxonomySeed = { slug: string; name: string; sortOrder: number };
type ColorSeed = TaxonomySeed & { swatch?: string };
type BouquetSizeSeed = TaxonomySeed & { description?: string };
type BudgetRangeSeed = {
  label: string;
  minMinor: number | null;
  maxMinor: number | null;
  sortOrder: number;
};

type BouquetSeed = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  /** Optional height in cm — not every bouquet has it. */
  heightCm?: number;
  bouquetSizeSlug: string;
  colorHex: string;
  prices: { S: number; M: number; L: number };
  occasions: string[];
  recipients: string[];
  colors: string[];
  components: Array<{ displayName: string; quantity: number; flowerSlug?: string }>;
  /** When set, seed attaches a ProductPromotion after variants exist. */
  promotion?:
    | { type: 'PERCENT'; percentOff: number }
    | { type: 'FIXED'; salePrices: { S: number; M: number; L: number } };
};

const FLOWERS: TaxonomySeed[] = [
  { slug: 'rozy', name: 'Розы', sortOrder: 10 },
  { slug: 'piony', name: 'Пионы', sortOrder: 20 },
  { slug: 'tyulpany', name: 'Тюльпаны', sortOrder: 30 },
  { slug: 'eustoma', name: 'Эустома', sortOrder: 40 },
];

const OCCASIONS: TaxonomySeed[] = [
  { slug: 'den-rozhdeniya', name: 'День рождения', sortOrder: 10 },
  { slug: '8-marta', name: '8 марта', sortOrder: 20 },
  { slug: 'bez-povoda', name: 'Без повода', sortOrder: 30 },
];

const RECIPIENTS: TaxonomySeed[] = [
  { slug: 'mame', name: 'Маме', sortOrder: 10 },
  { slug: 'lyubimoy', name: 'Любимой', sortOrder: 20 },
  { slug: 'kollege', name: 'Коллеге', sortOrder: 30 },
];

const COLORS: ColorSeed[] = [
  { slug: 'rozovyy', name: 'Розовый', sortOrder: 10, swatch: '#f3c4d4' },
  { slug: 'belyy', name: 'Белый', sortOrder: 20, swatch: '#f5f2ea' },
  { slug: 'krasnyy', name: 'Красный', sortOrder: 30, swatch: '#c45c5c' },
];

const PRODUCT_LINES: TaxonomySeed[] = [
  { slug: 'mono-bukety-roza', name: 'Моно букеты Роза', sortOrder: 10 },
  { slug: 'kompozicii-v-shlyapnoj-korobke', name: 'Композиции в шляпной коробке', sortOrder: 20 },
  { slug: 'mono-bukety-kalla', name: 'Моно букеты Калла', sortOrder: 30 },
  { slug: 'mono-bukety-eustoma', name: 'Моно букеты Эустома', sortOrder: 40 },
];

const BOUQUET_SIZES: BouquetSizeSeed[] = [
  // Slugs match migration 20260926120000 defaults (transliteration without trailing soft-sign).
  { slug: 'malenkij', name: 'Маленький', sortOrder: 10, description: 'Компактный букет' },
  { slug: 'srednij', name: 'Средний', sortOrder: 20, description: 'Универсальный размер' },
  { slug: 'bolshoj', name: 'Большой', sortOrder: 30, description: 'Объёмный подарок' },
  { slug: 'ochen-bolshoj', name: 'Очень большой', sortOrder: 40, description: 'Максимальный размер' },
];

/** Admin-managed budget chips — minor BYN (1 BYN = 100). */
const BUDGET_RANGES: BudgetRangeSeed[] = [
  { label: 'до 100 BYN', minMinor: null, maxMinor: 9999, sortOrder: 10 },
  { label: '100–150 BYN', minMinor: 10000, maxMinor: 15000, sortOrder: 20 },
  { label: 'от 150 BYN', minMinor: 15001, maxMinor: null, sortOrder: 30 },
];

/** Prices are BYN minor units (1 BYN = 100). */
const BOUQUETS: BouquetSeed[] = [
  {
    slug: 'ameli',
    name: 'Амели',
    shortDescription: 'Нежный розовый букет с розами и эустомой.',
    description: 'Мягкая палитра для тёплого поздравления. Подходит на день рождения и «просто так».',
    heightCm: 45,
    bouquetSizeSlug: 'srednij',
    colorHex: '#f3c4d4',
    prices: { S: 8900, M: 11900, L: 14900 },
    occasions: ['den-rozhdeniya', 'bez-povoda'],
    recipients: ['lyubimoy', 'mame'],
    colors: ['rozovyy'],
    components: [
      { displayName: 'Роза', quantity: 7, flowerSlug: 'rozy' },
      { displayName: 'Эустома', quantity: 3, flowerSlug: 'eustoma' },
    ],
    promotion: { type: 'PERCENT', percentOff: 15 },
  },
  {
    slug: 'miya',
    name: 'Мия',
    shortDescription: 'Светлый букет с белыми акцентами.',
    description: 'Чистая композиция для спокойного подарка маме или коллеге.',
    heightCm: 40,
    bouquetSizeSlug: 'srednij',
    colorHex: '#efe8df',
    prices: { S: 7900, M: 10900, L: 13900 },
    occasions: ['den-rozhdeniya', 'bez-povoda'],
    recipients: ['mame', 'kollege'],
    colors: ['belyy', 'rozovyy'],
    components: [
      { displayName: 'Роза', quantity: 5, flowerSlug: 'rozy' },
      { displayName: 'Эустома', quantity: 5, flowerSlug: 'eustoma' },
    ],
    promotion: { type: 'PERCENT', percentOff: 10 },
  },
  {
    slug: 'oblako',
    name: 'Облако',
    shortDescription: 'Воздушный монобукет из роз.',
    description: 'Лёгкий объём и спокойный белый тон — когда хочется «воздуха».',
    heightCm: 55,
    bouquetSizeSlug: 'bolshoj',
    colorHex: '#e8eef5',
    prices: { S: 9900, M: 12900, L: 16900 },
    occasions: ['bez-povoda'],
    recipients: ['lyubimoy'],
    colors: ['belyy'],
    components: [{ displayName: 'Роза белая', quantity: 15, flowerSlug: 'rozy' }],
    promotion: { type: 'PERCENT', percentOff: 12 },
  },
  {
    slug: 'nezhnost',
    name: 'Нежность',
    shortDescription: 'Пионы и розы в мягкой гамме.',
    description: 'Сезонный характер пионов — букет для особого дня.',
    heightCm: 50,
    bouquetSizeSlug: 'srednij',
    colorHex: '#f7d6e0',
    prices: { S: 12900, M: 16900, L: 21900 },
    occasions: ['den-rozhdeniya', '8-marta'],
    recipients: ['lyubimoy', 'mame'],
    colors: ['rozovyy'],
    components: [
      { displayName: 'Пион', quantity: 5, flowerSlug: 'piony' },
      { displayName: 'Роза', quantity: 5, flowerSlug: 'rozy' },
    ],
  },
  {
    slug: 'romans',
    name: 'Романс',
    shortDescription: 'Классические красные розы.',
    description: 'Прямой и понятный жест — монобукет для любимой.',
    heightCm: 60,
    bouquetSizeSlug: 'bolshoj',
    colorHex: '#e8b4b8',
    prices: { S: 10900, M: 14900, L: 19900 },
    occasions: ['bez-povoda', 'den-rozhdeniya'],
    recipients: ['lyubimoy'],
    colors: ['krasnyy'],
    components: [{ displayName: 'Роза красная', quantity: 11, flowerSlug: 'rozy' }],
    promotion: { type: 'FIXED', salePrices: { S: 8900, M: 11900, L: 15900 } },
  },
  {
    slug: 'vesna',
    name: 'Весна',
    shortDescription: 'Тюльпаны в свежей весенней сборке.',
    description: 'Лёгкий сезонный букет — к 8 марта и просто так.',
    bouquetSizeSlug: 'malenkij',
    colorHex: '#f5e6c8',
    prices: { S: 6900, M: 9900, L: 12900 },
    occasions: ['8-marta', 'bez-povoda'],
    recipients: ['mame', 'kollege'],
    colors: ['rozovyy', 'belyy'],
    components: [{ displayName: 'Тюльпан', quantity: 15, flowerSlug: 'tyulpany' }],
    promotion: { type: 'PERCENT', percentOff: 20 },
  },
  {
    slug: 'tiffany',
    name: 'Тиффани',
    shortDescription: 'Эустома с акцентом на воздушную форму.',
    description: 'Мягкий силуэт для спокойного поздравления.',
    bouquetSizeSlug: 'srednij',
    colorHex: '#d9ebe6',
    prices: { S: 9500, M: 12500, L: 15500 },
    occasions: ['den-rozhdeniya'],
    recipients: ['kollege', 'mame'],
    colors: ['belyy'],
    components: [{ displayName: 'Эустома', quantity: 9, flowerSlug: 'eustoma' }],
    promotion: { type: 'FIXED', salePrices: { S: 7900, M: 10500, L: 12900 } },
  },
  {
    slug: 'pionovyy',
    name: 'Пионовый',
    shortDescription: 'Пышный букет на пионах.',
    description: 'Объём и фактура — когда нужен заметный подарок.',
    heightCm: 48,
    bouquetSizeSlug: 'bolshoj',
    colorHex: '#f0c9d4',
    prices: { S: 15900, M: 19900, L: 24900 },
    occasions: ['den-rozhdeniya', '8-marta'],
    recipients: ['lyubimoy'],
    colors: ['rozovyy'],
    components: [{ displayName: 'Пион', quantity: 9, flowerSlug: 'piony' }],
  },
  {
    slug: 'lavanda',
    name: 'Лаванда',
    shortDescription: 'Спокойная палитра с эустомой и розами.',
    description: 'Сдержанный букет для коллеги или «просто так».',
    bouquetSizeSlug: 'srednij',
    colorHex: '#ddd6e8',
    prices: { S: 8500, M: 11500, L: 14500 },
    occasions: ['bez-povoda'],
    recipients: ['kollege', 'mame'],
    colors: ['rozovyy', 'belyy'],
    components: [
      { displayName: 'Эустома', quantity: 5, flowerSlug: 'eustoma' },
      { displayName: 'Роза', quantity: 5, flowerSlug: 'rozy' },
    ],
  },
  {
    slug: 'solntse',
    name: 'Солнце',
    shortDescription: 'Тёплый акцент на тюльпанах и розах.',
    description: 'Ярче обычного нежного букета — для дня рождения.',
    bouquetSizeSlug: 'srednij',
    colorHex: '#f3dfb8',
    prices: { S: 10500, M: 13500, L: 17500 },
    occasions: ['den-rozhdeniya'],
    recipients: ['lyubimoy', 'mame'],
    colors: ['rozovyy'],
    components: [
      { displayName: 'Тюльпан', quantity: 7, flowerSlug: 'tyulpany' },
      { displayName: 'Роза', quantity: 5, flowerSlug: 'rozy' },
    ],
  },
];

/** Former "featured" bouquets — curated into the default bestsellers group. */
const BESTSELLER_ALL_SLUGS = ['ameli', 'miya', 'nezhnost', 'pionovyy'];
const BESTSELLER_ROSES_SLUGS = ['ameli', 'oblako', 'romans', 'lavanda'];

function assertDevSeedAllowed(databaseUrl: string): { host: string; database: string } {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing seed: NODE_ENV=production');
  }
  // Only the process environment at invocation time counts — not values loaded from `.env`.
  if (!allowDevCatalogSeedExplicit) {
    throw new Error(
      'Refusing seed: set ALLOW_DEV_CATALOG_SEED=true in the shell for this command (not via .env alone)',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing seed: DATABASE_URL is not a valid URL');
  }

  const host = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] || '(unknown)');

  if (PRODUCTION_HOST_HINTS.some((hint) => host.includes(hint))) {
    throw new Error(
      `Refusing seed: DATABASE_URL host "${host}" looks like production (${PRODUCTION_HOST_HINTS.join(', ')})`,
    );
  }

  console.log('Dev catalog seed safety checks passed.');
  console.log(`  NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}`);
  console.log(`  host=${host}`);
  console.log(`  database=${database}`);
  console.log('This will upsert known slugs only — unrelated products are not wiped.');

  return { host, database };
}

async function upsertFlower(
  prisma: PrismaClient,
  item: TaxonomySeed,
): Promise<{ id: string; slug: string }> {
  const data = { name: item.name, sortOrder: item.sortOrder, visibility: 'VISIBLE' as const };
  const row = await prisma.flower.upsert({
    where: { slug: item.slug },
    create: { slug: item.slug, ...data },
    update: data,
  });
  return { id: row.id, slug: row.slug };
}

async function upsertOccasion(
  prisma: PrismaClient,
  item: TaxonomySeed,
): Promise<{ id: string; slug: string }> {
  const data = { name: item.name, sortOrder: item.sortOrder, visibility: 'VISIBLE' as const };
  const row = await prisma.occasion.upsert({
    where: { slug: item.slug },
    create: { slug: item.slug, ...data },
    update: data,
  });
  return { id: row.id, slug: row.slug };
}

async function upsertRecipient(
  prisma: PrismaClient,
  item: TaxonomySeed,
): Promise<{ id: string; slug: string }> {
  const data = { name: item.name, sortOrder: item.sortOrder, visibility: 'VISIBLE' as const };
  const row = await prisma.recipient.upsert({
    where: { slug: item.slug },
    create: { slug: item.slug, ...data },
    update: data,
  });
  return { id: row.id, slug: row.slug };
}

async function upsertColor(
  prisma: PrismaClient,
  item: ColorSeed,
): Promise<{ id: string; slug: string }> {
  const data = {
    name: item.name,
    sortOrder: item.sortOrder,
    visibility: 'VISIBLE' as const,
    swatch: item.swatch ?? null,
  };
  const row = await prisma.color.upsert({
    where: { slug: item.slug },
    create: { slug: item.slug, ...data },
    update: data,
  });
  return { id: row.id, slug: row.slug };
}

async function upsertProductLine(
  prisma: PrismaClient,
  item: TaxonomySeed,
): Promise<{ id: string; slug: string }> {
  const data = { name: item.name, sortOrder: item.sortOrder, visibility: 'VISIBLE' as const };
  const row = await prisma.productLine.upsert({
    where: { slug: item.slug },
    create: { slug: item.slug, ...data },
    update: data,
  });
  return { id: row.id, slug: row.slug };
}

async function upsertBouquetSize(
  prisma: PrismaClient,
  item: BouquetSizeSeed,
): Promise<{ id: string; slug: string }> {
  const data = {
    name: item.name,
    description: item.description ?? null,
    sortOrder: item.sortOrder,
    visibility: 'VISIBLE' as const,
  };
  const row = await prisma.bouquetSize.upsert({
    where: { slug: item.slug },
    create: { slug: item.slug, ...data },
    update: data,
  });
  return { id: row.id, slug: row.slug };
}

async function upsertBudgetRanges(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.budgetRange.findMany({ orderBy: { sortOrder: 'asc' } });
  const byLabel = new Map(existing.map((row) => [row.label, row]));

  for (const item of BUDGET_RANGES) {
    const found = byLabel.get(item.label);
    const data = {
      label: item.label,
      minMinor: item.minMinor === null ? null : BigInt(item.minMinor),
      maxMinor: item.maxMinor === null ? null : BigInt(item.maxMinor),
      sortOrder: item.sortOrder,
      active: true,
    };
    if (found) {
      await prisma.budgetRange.update({
        where: { id: found.id },
        data,
      });
    } else {
      await prisma.budgetRange.create({ data });
    }
  }
}

async function renderPlaceholderJpeg(name: string, colorHex: string): Promise<Buffer> {
  const width = 800;
  const height = 1000;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${colorHex}"/>
      <rect x="48" y="48" width="${width - 96}" height="${height - 96}" fill="none" stroke="#ffffff99" stroke-width="2"/>
      <text x="50%" y="48%" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#5c4a45">${escapeXml(name)}</text>
      <text x="50%" y="56%" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#7a655e">BUKET №1 · placeholder</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function ensureProductMedia(
  prisma: PrismaClient,
  productId: string,
  bouquet: BouquetSeed,
  mediaRoot: string,
): Promise<void> {
  const existingPrimary = await prisma.productMedia.findFirst({
    where: { productId, isPrimary: true },
    include: { mediaAsset: true },
  });
  if (existingPrimary) {
    return;
  }

  const jpeg = await renderPlaceholderJpeg(bouquet.name, bouquet.colorHex);
  const checksum = createHash('sha256').update(jpeg).digest('hex');
  const assetId = randomUUID();
  const masterKey = `masters/${assetId}.jpg`;
  const fullPath = join(mediaRoot, masterKey);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, jpeg);

  const webp = await sharp(jpeg).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const derivativeKey = `derivatives/${assetId}/w800.webp`;
  const derivativePath = join(mediaRoot, derivativeKey);
  await mkdir(dirname(derivativePath), { recursive: true });
  await writeFile(derivativePath, webp);

  const meta = await sharp(jpeg).metadata();
  await prisma.mediaAsset.create({
    data: {
      id: assetId,
      storageKey: masterKey,
      mimeType: 'image/jpeg',
      format: 'JPEG',
      byteSize: jpeg.byteLength,
      width: meta.width ?? 800,
      height: meta.height ?? 1000,
      checksumSha256: checksum,
      derivatives: {
        create: {
          width: 800,
          format: 'WEBP',
          storageKey: derivativeKey,
          byteSize: webp.byteLength,
        },
      },
    },
  });

  await prisma.productMedia.create({
    data: {
      productId,
      mediaAssetId: assetId,
      sortOrder: 0,
      isPrimary: true,
      alt: `Букет «${bouquet.name}»`,
    },
  });
}

type IdMaps = {
  flowers: Map<string, string>;
  occasions: Map<string, string>;
  recipients: Map<string, string>;
  colors: Map<string, string>;
  bouquetSizes: Map<string, string>;
};

async function upsertBouquet(
  prisma: PrismaClient,
  bouquet: BouquetSeed,
  ids: IdMaps,
  mediaRoot: string,
): Promise<string> {
  const bouquetSizeId = ids.bouquetSizes.get(bouquet.bouquetSizeSlug) ?? null;

  const product = await prisma.product.upsert({
    where: { slug: bouquet.slug },
    create: {
      slug: bouquet.slug,
      name: bouquet.name,
      shortDescription: bouquet.shortDescription,
      description: bouquet.description,
      lifecycle: 'PUBLISHED',
      availability: 'AVAILABLE',
      bouquetHeightCm: bouquet.heightCm ?? null,
      bouquetSizeId,
      currency: 'BYN',
      publishedAt: new Date(),
      seoTitle: `${bouquet.name} — букет с доставкой по Гродно`,
      seoDescription: bouquet.shortDescription,
    },
    update: {
      name: bouquet.name,
      shortDescription: bouquet.shortDescription,
      description: bouquet.description,
      lifecycle: 'PUBLISHED',
      availability: 'AVAILABLE',
      bouquetHeightCm: bouquet.heightCm ?? null,
      bouquetSizeId,
      publishedAt: new Date(),
      seoTitle: `${bouquet.name} — букет с доставкой по Гродно`,
      seoDescription: bouquet.shortDescription,
    },
  });

  // Drop promotion before recreating variants (FK to variant sale prices).
  await prisma.productPromotion.deleteMany({ where: { productId: product.id } });

  await prisma.productVariant.deleteMany({ where: { productId: product.id } });
  await prisma.productVariant.createMany({
    data: [
      { productId: product.id, name: 'S', priceMinor: BigInt(bouquet.prices.S), sortOrder: 0, status: 'ACTIVE' },
      { productId: product.id, name: 'M', priceMinor: BigInt(bouquet.prices.M), sortOrder: 1, status: 'ACTIVE' },
      { productId: product.id, name: 'L', priceMinor: BigInt(bouquet.prices.L), sortOrder: 2, status: 'ACTIVE' },
    ],
  });

  await prisma.productComponent.deleteMany({ where: { productId: product.id } });
  await prisma.productComponent.createMany({
    data: bouquet.components.map((component, index) => ({
      productId: product.id,
      displayName: component.displayName,
      quantity: component.quantity,
      unit: 'STEM' as const,
      sortOrder: index,
      flowerId: component.flowerSlug ? ids.flowers.get(component.flowerSlug) ?? null : null,
    })),
  });

  await prisma.productOccasion.deleteMany({ where: { productId: product.id } });
  await prisma.productRecipient.deleteMany({ where: { productId: product.id } });
  await prisma.productColor.deleteMany({ where: { productId: product.id } });

  await prisma.productOccasion.createMany({
    data: bouquet.occasions
      .map((slug) => ids.occasions.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((occasionId) => ({ productId: product.id, occasionId })),
  });
  await prisma.productRecipient.createMany({
    data: bouquet.recipients
      .map((slug) => ids.recipients.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((recipientId) => ({ productId: product.id, recipientId })),
  });
  await prisma.productColor.createMany({
    data: bouquet.colors
      .map((slug) => ids.colors.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((colorId) => ({ productId: product.id, colorId })),
  });

  if (bouquet.promotion) {
    const variants = await prisma.productVariant.findMany({
      where: { productId: product.id },
      orderBy: { sortOrder: 'asc' },
    });
    const byName = new Map(variants.map((v) => [v.name, v]));

    if (bouquet.promotion.type === 'PERCENT') {
      await prisma.productPromotion.create({
        data: {
          productId: product.id,
          enabled: true,
          type: 'PERCENT',
          percentOff: bouquet.promotion.percentOff,
        },
      });
    } else {
      const sale = bouquet.promotion.salePrices;
      const prices = [
        { variant: byName.get('S'), salePriceMinor: sale.S },
        { variant: byName.get('M'), salePriceMinor: sale.M },
        { variant: byName.get('L'), salePriceMinor: sale.L },
      ].filter((entry): entry is { variant: NonNullable<(typeof variants)[number]>; salePriceMinor: number } =>
        Boolean(entry.variant),
      );

      await prisma.productPromotion.create({
        data: {
          productId: product.id,
          enabled: true,
          type: 'FIXED',
          percentOff: null,
          variantPrices: {
            create: prices.map(({ variant, salePriceMinor }) => ({
              variantId: variant.id,
              salePriceMinor: BigInt(salePriceMinor),
            })),
          },
        },
      });
    }
  }

  await ensureProductMedia(prisma, product.id, bouquet, mediaRoot);
  return product.id;
}

async function upsertBestsellers(
  prisma: PrismaClient,
  productsBySlug: Map<string, string>,
): Promise<void> {
  const groups: Array<{ slug: string; name: string; title: string; sortOrder: number; productSlugs: string[] }> = [
    {
      slug: 'vse',
      name: 'Все',
      title: 'Все',
      sortOrder: 10,
      productSlugs: BESTSELLER_ALL_SLUGS,
    },
    {
      slug: 'rozy',
      name: 'Розы',
      title: 'Розы',
      sortOrder: 20,
      productSlugs: BESTSELLER_ROSES_SLUGS,
    },
    {
      // Homepage «Подарки» shelf — assign products in Admin → Бестселлеры / product editor.
      slug: 'podarki',
      name: 'Подарки',
      title: 'Подарки',
      sortOrder: 30,
      productSlugs: BESTSELLER_ALL_SLUGS.slice(0, 4),
    },
  ];

  for (const group of groups) {
    const row = await prisma.bestsellerGroup.upsert({
      where: { slug: group.slug },
      create: {
        slug: group.slug,
        name: group.name,
        title: group.title,
        sortOrder: group.sortOrder,
        active: true,
      },
      update: {
        name: group.name,
        title: group.title,
        sortOrder: group.sortOrder,
        active: true,
      },
    });

    await prisma.bestsellerGroupProduct.deleteMany({ where: { groupId: row.id } });
    const links = group.productSlugs
      .map((slug) => productsBySlug.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((productId, index) => ({ groupId: row.id, productId, sortOrder: index }));

    if (links.length > 0) {
      await prisma.bestsellerGroupProduct.createMany({ data: links });
    }
  }
}

function homepageNeedsRewrite(config: unknown): boolean {
  if (!config || typeof config !== 'object') return true;
  const sections = (config as { sections?: unknown }).sections;
  if (!Array.isArray(sections) || sections.length === 0) return true;
  return sections.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const kind = (entry as { kind?: string }).kind;
    return kind === 'featured' || kind === 'collection' || kind === 'collections';
  });
}

async function upsertStorefront(prisma: PrismaClient): Promise<void> {
  const defaults = {
    brandName: 'BUKET №1',
    city: 'Гродно',
    phone: '+375 (29) 798-22-22',
    email: 'hello@bouquet.local',
    address: 'пр-т Янки Купалы, 67А, г. Гродно, 230000',
    workingHours: '9:00–21:00',
    deliverySummary:
      'Доставляем букеты по Гродно. После оформления заказа менеджер свяжется для подтверждения деталей.',
    aboutSummary:
      'BUKET №1 — цветочный магазин в Гродно. Собираем букеты, которые хочется дарить: свежие цветы, аккуратная сборка, понятная доставка.',
    substitutionNote:
      'Цветы — сезонный продукт. Отдельные позиции могут быть заменены на равноценные с сохранением стиля, палитры и стоимости букета.',
  };

  const existingSettings = await prisma.storefrontSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (!existingSettings) {
    await prisma.storefrontSettings.create({
      data: { id: SINGLETON_ID, ...defaults },
    });
    console.log('Created StorefrontSettings defaults.');
  } else {
    await prisma.storefrontSettings.update({
      where: { id: SINGLETON_ID },
      data: {
        brandName: defaults.brandName,
        phone: defaults.phone,
        address: defaults.address,
        workingHours: defaults.workingHours,
        city: defaults.city,
        aboutSummary: defaults.aboutSummary,
      },
    });
    console.log('Updated StorefrontSettings brand + contact details.');
  }

  const existingHomepage = await prisma.homepageConfig.findUnique({ where: { id: SINGLETON_ID } });
  const homepage = defaultHomepageConfig();
  if (!existingHomepage) {
    await prisma.homepageConfig.create({
      data: {
        id: SINGLETON_ID,
        config: homepage,
      },
    });
    console.log('Created HomepageConfig defaults (bestsellers + promotions).');
  } else if (homepageNeedsRewrite(existingHomepage.config)) {
    await prisma.homepageConfig.update({
      where: { id: SINGLETON_ID },
      data: { config: homepage },
    });
    console.log('Replaced legacy HomepageConfig (featured/collection → bestsellers/promotions).');
  } else {
    console.log('HomepageConfig already present — left intact.');
  }
}

async function upsertFulfillment(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.fulfillmentSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) {
    console.log('FulfillmentSettings already present — left intact.');
    return;
  }

  await prisma.fulfillmentSettings.create({
    data: {
      id: SINGLETON_ID,
      deliveryEnabled: true,
      pickupEnabled: true,
      deliveryFeeMinor: 0n,
      minLeadTimeMinutes: 120,
      maxAdvanceDays: 14,
      timeWindows: defaultTimeWindows() as object,
      pickupInstructions: 'Самовывоз: уточните адрес у менеджера после оформления заказа.',
    },
  });
  console.log('Created FulfillmentSettings defaults.');
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  assertDevSeedAllowed(databaseUrl);

  const mediaRoot = resolve(
    process.cwd(),
    process.env.MEDIA_LOCAL_ROOT ?? './storage/media',
  );
  console.log(`MEDIA_LOCAL_ROOT=${mediaRoot}`);

  const prisma = await createPrismaClient({ connectionString: databaseUrl });

  try {
    const flowers = new Map<string, string>();
    const occasions = new Map<string, string>();
    const recipients = new Map<string, string>();
    const colors = new Map<string, string>();
    const bouquetSizes = new Map<string, string>();

    for (const item of FLOWERS) {
      const row = await upsertFlower(prisma, item);
      flowers.set(row.slug, row.id);
    }
    for (const item of OCCASIONS) {
      const row = await upsertOccasion(prisma, item);
      occasions.set(row.slug, row.id);
    }
    for (const item of RECIPIENTS) {
      const row = await upsertRecipient(prisma, item);
      recipients.set(row.slug, row.id);
    }
    for (const item of COLORS) {
      const row = await upsertColor(prisma, item);
      colors.set(row.slug, row.id);
    }
    for (const item of PRODUCT_LINES) {
      await upsertProductLine(prisma, item);
    }
    for (const item of BOUQUET_SIZES) {
      const row = await upsertBouquetSize(prisma, item);
      bouquetSizes.set(row.slug, row.id);
    }
    await upsertBudgetRanges(prisma);
    console.log(`Upserted ${BUDGET_RANGES.length} budget ranges.`);
    console.log(`Upserted ${PRODUCT_LINES.length} product lines.`);

    const productsBySlug = new Map<string, string>();
    for (const bouquet of BOUQUETS) {
      const id = await upsertBouquet(
        prisma,
        bouquet,
        { flowers, occasions, recipients, colors, bouquetSizes },
        mediaRoot,
      );
      productsBySlug.set(bouquet.slug, id);
      console.log(`Upserted product ${bouquet.slug}`);
    }

    await upsertBestsellers(prisma, productsBySlug);
    console.log('Upserted bestseller groups vse + rozy.');

    await upsertStorefront(prisma);
    await upsertFulfillment(prisma);
    console.log(`Done. Seeded ${BOUQUETS.length} bouquets.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

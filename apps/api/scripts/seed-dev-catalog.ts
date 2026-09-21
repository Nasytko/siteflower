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
import { defaultHomepageConfig } from '@bouquet-one/contracts';
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

type BouquetSeed = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  featured: boolean;
  colorHex: string;
  prices: { S: number; M: number; L: number };
  flowers: string[];
  occasions: string[];
  recipients: string[];
  styles: string[];
  colors: string[];
  categories: string[];
  components: Array<{ displayName: string; quantity: number; flowerSlug?: string }>;
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

const STYLES: TaxonomySeed[] = [
  { slug: 'nezhnye', name: 'Нежные', sortOrder: 10 },
  { slug: 'monobukety', name: 'Монобукеты', sortOrder: 20 },
  { slug: 'pyshnye', name: 'Пышные', sortOrder: 30 },
];

const COLORS: TaxonomySeed[] = [
  { slug: 'rozovyy', name: 'Розовый', sortOrder: 10 },
  { slug: 'belyy', name: 'Белый', sortOrder: 20 },
  { slug: 'krasnyy', name: 'Красный', sortOrder: 30 },
];

const CATEGORIES: TaxonomySeed[] = [
  { slug: 'bukety', name: 'Букеты', sortOrder: 10 },
  { slug: 'kompozitsii', name: 'Композиции', sortOrder: 20 },
];

/** Prices are BYN minor units (1 BYN = 100). */
const BOUQUETS: BouquetSeed[] = [
  {
    slug: 'ameli',
    name: 'Амели',
    shortDescription: 'Нежный розовый букет с розами и эустомой.',
    description: 'Мягкая палитра для тёплого поздравления. Подходит на день рождения и «просто так».',
    featured: true,
    colorHex: '#f3c4d4',
    prices: { S: 8900, M: 11900, L: 14900 },
    flowers: ['rozy', 'eustoma'],
    occasions: ['den-rozhdeniya', 'bez-povoda'],
    recipients: ['lyubimoy', 'mame'],
    styles: ['nezhnye'],
    colors: ['rozovyy'],
    categories: ['bukety'],
    components: [
      { displayName: 'Роза', quantity: 7, flowerSlug: 'rozy' },
      { displayName: 'Эустома', quantity: 3, flowerSlug: 'eustoma' },
    ],
  },
  {
    slug: 'miya',
    name: 'Мия',
    shortDescription: 'Светлый букет с белыми акцентами.',
    description: 'Чистая композиция для спокойного подарка маме или коллеге.',
    featured: true,
    colorHex: '#efe8df',
    prices: { S: 7900, M: 10900, L: 13900 },
    flowers: ['rozy', 'eustoma'],
    occasions: ['den-rozhdeniya', 'bez-povoda'],
    recipients: ['mame', 'kollege'],
    styles: ['nezhnye'],
    colors: ['belyy', 'rozovyy'],
    categories: ['bukety'],
    components: [
      { displayName: 'Роза', quantity: 5, flowerSlug: 'rozy' },
      { displayName: 'Эустома', quantity: 5, flowerSlug: 'eustoma' },
    ],
  },
  {
    slug: 'oblako',
    name: 'Облако',
    shortDescription: 'Воздушный монобукет из роз.',
    description: 'Лёгкий объём и спокойный белый тон — когда хочется «воздуха».',
    featured: false,
    colorHex: '#e8eef5',
    prices: { S: 9900, M: 12900, L: 16900 },
    flowers: ['rozy'],
    occasions: ['bez-povoda'],
    recipients: ['lyubimoy'],
    styles: ['monobukety', 'nezhnye'],
    colors: ['belyy'],
    categories: ['bukety'],
    components: [{ displayName: 'Роза белая', quantity: 15, flowerSlug: 'rozy' }],
  },
  {
    slug: 'nezhnost',
    name: 'Нежность',
    shortDescription: 'Пионы и розы в мягкой гамме.',
    description: 'Сезонный характер пионов — букет для особого дня.',
    featured: true,
    colorHex: '#f7d6e0',
    prices: { S: 12900, M: 16900, L: 21900 },
    flowers: ['piony', 'rozy'],
    occasions: ['den-rozhdeniya', '8-marta'],
    recipients: ['lyubimoy', 'mame'],
    styles: ['nezhnye', 'pyshnye'],
    colors: ['rozovyy'],
    categories: ['bukety'],
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
    featured: false,
    colorHex: '#e8b4b8',
    prices: { S: 10900, M: 14900, L: 19900 },
    flowers: ['rozy'],
    occasions: ['bez-povoda', 'den-rozhdeniya'],
    recipients: ['lyubimoy'],
    styles: ['monobukety'],
    colors: ['krasnyy'],
    categories: ['bukety'],
    components: [{ displayName: 'Роза красная', quantity: 11, flowerSlug: 'rozy' }],
  },
  {
    slug: 'vesna',
    name: 'Весна',
    shortDescription: 'Тюльпаны в свежей весенней сборке.',
    description: 'Лёгкий сезонный букет — к 8 марта и просто так.',
    featured: false,
    colorHex: '#f5e6c8',
    prices: { S: 6900, M: 9900, L: 12900 },
    flowers: ['tyulpany'],
    occasions: ['8-marta', 'bez-povoda'],
    recipients: ['mame', 'kollege'],
    styles: ['monobukety', 'nezhnye'],
    colors: ['rozovyy', 'belyy'],
    categories: ['bukety'],
    components: [{ displayName: 'Тюльпан', quantity: 15, flowerSlug: 'tyulpany' }],
  },
  {
    slug: 'tiffany',
    name: 'Тиффани',
    shortDescription: 'Эустома с акцентом на воздушную форму.',
    description: 'Мягкий силуэт для спокойного поздравления.',
    featured: false,
    colorHex: '#d9ebe6',
    prices: { S: 9500, M: 12500, L: 15500 },
    flowers: ['eustoma'],
    occasions: ['den-rozhdeniya'],
    recipients: ['kollege', 'mame'],
    styles: ['nezhnye'],
    colors: ['belyy'],
    categories: ['bukety'],
    components: [{ displayName: 'Эустома', quantity: 9, flowerSlug: 'eustoma' }],
  },
  {
    slug: 'pionovyy',
    name: 'Пионовый',
    shortDescription: 'Пышный букет на пионах.',
    description: 'Объём и фактура — когда нужен заметный подарок.',
    featured: true,
    colorHex: '#f0c9d4',
    prices: { S: 15900, M: 19900, L: 24900 },
    flowers: ['piony'],
    occasions: ['den-rozhdeniya', '8-marta'],
    recipients: ['lyubimoy'],
    styles: ['pyshnye', 'monobukety'],
    colors: ['rozovyy'],
    categories: ['bukety'],
    components: [{ displayName: 'Пион', quantity: 9, flowerSlug: 'piony' }],
  },
  {
    slug: 'lavanda',
    name: 'Лаванда',
    shortDescription: 'Спокойная палитра с эустомой и розами.',
    description: 'Сдержанный букет для коллеги или «просто так».',
    featured: false,
    colorHex: '#ddd6e8',
    prices: { S: 8500, M: 11500, L: 14500 },
    flowers: ['eustoma', 'rozy'],
    occasions: ['bez-povoda'],
    recipients: ['kollege', 'mame'],
    styles: ['nezhnye'],
    colors: ['rozovyy', 'belyy'],
    categories: ['bukety'],
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
    featured: false,
    colorHex: '#f3dfb8',
    prices: { S: 10500, M: 13500, L: 17500 },
    flowers: ['tyulpany', 'rozy'],
    occasions: ['den-rozhdeniya'],
    recipients: ['lyubimoy', 'mame'],
    styles: ['pyshnye'],
    colors: ['rozovyy'],
    categories: ['bukety', 'kompozitsii'],
    components: [
      { displayName: 'Тюльпан', quantity: 7, flowerSlug: 'tyulpany' },
      { displayName: 'Роза', quantity: 5, flowerSlug: 'rozy' },
    ],
  },
];

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
  // pathname is `/dbname`; strip optional schema query separately
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

async function upsertTaxonomy(
  prisma: PrismaClient,
  model: 'flower' | 'occasion' | 'recipient' | 'style' | 'color' | 'category',
  item: TaxonomySeed,
): Promise<{ id: string; slug: string }> {
  const data = {
    name: item.name,
    sortOrder: item.sortOrder,
    visibility: 'VISIBLE' as const,
  };
  if (model === 'flower') {
    const row = await prisma.flower.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data,
    });
    return { id: row.id, slug: row.slug };
  }
  if (model === 'occasion') {
    const row = await prisma.occasion.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data,
    });
    return { id: row.id, slug: row.slug };
  }
  if (model === 'recipient') {
    const row = await prisma.recipient.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data,
    });
    return { id: row.id, slug: row.slug };
  }
  if (model === 'style') {
    const row = await prisma.style.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data,
    });
    return { id: row.id, slug: row.slug };
  }
  if (model === 'color') {
    const row = await prisma.color.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data,
    });
    return { id: row.id, slug: row.slug };
  }
  const row = await prisma.category.upsert({
    where: { slug: item.slug },
    create: { slug: item.slug, ...data },
    update: data,
  });
  return { id: row.id, slug: row.slug };
}

async function renderPlaceholderJpeg(name: string, colorHex: string): Promise<Buffer> {
  const width = 800;
  const height = 1000;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${colorHex}"/>
      <rect x="48" y="48" width="${width - 96}" height="${height - 96}" fill="none" stroke="#ffffff99" stroke-width="2"/>
      <text x="50%" y="48%" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#5c4a45">${escapeXml(name)}</text>
      <text x="50%" y="56%" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#7a655e">БУКЕТ №1 · placeholder</text>
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

  // One lightweight WebP derivative for cards (skip full AVIF/size matrix for seed speed).
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

async function upsertBouquet(
  prisma: PrismaClient,
  bouquet: BouquetSeed,
  ids: {
    flowers: Map<string, string>;
    occasions: Map<string, string>;
    recipients: Map<string, string>;
    styles: Map<string, string>;
    colors: Map<string, string>;
    categories: Map<string, string>;
  },
  mediaRoot: string,
): Promise<string> {
  const product = await prisma.product.upsert({
    where: { slug: bouquet.slug },
    create: {
      slug: bouquet.slug,
      name: bouquet.name,
      shortDescription: bouquet.shortDescription,
      description: bouquet.description,
      lifecycle: 'PUBLISHED',
      availability: 'AVAILABLE',
      featured: bouquet.featured,
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
      featured: bouquet.featured,
      publishedAt: new Date(),
      seoTitle: `${bouquet.name} — букет с доставкой по Гродно`,
      seoDescription: bouquet.shortDescription,
    },
  });

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

  await prisma.productCategory.deleteMany({ where: { productId: product.id } });
  await prisma.productOccasion.deleteMany({ where: { productId: product.id } });
  await prisma.productRecipient.deleteMany({ where: { productId: product.id } });
  await prisma.productStyle.deleteMany({ where: { productId: product.id } });
  await prisma.productColor.deleteMany({ where: { productId: product.id } });

  await prisma.productCategory.createMany({
    data: bouquet.categories
      .map((slug) => ids.categories.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((categoryId) => ({ productId: product.id, categoryId })),
  });
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
  await prisma.productStyle.createMany({
    data: bouquet.styles
      .map((slug) => ids.styles.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((styleId) => ({ productId: product.id, styleId })),
  });
  await prisma.productColor.createMany({
    data: bouquet.colors
      .map((slug) => ids.colors.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((colorId) => ({ productId: product.id, colorId })),
  });

  await ensureProductMedia(prisma, product.id, bouquet, mediaRoot);
  return product.id;
}

async function upsertCollections(prisma: PrismaClient, featuredProductIds: string[]): Promise<void> {
  const featured = await prisma.collection.upsert({
    where: { slug: 'izbrannoe' },
    create: {
      slug: 'izbrannoe',
      name: 'Избранное',
      description: 'Ручная подборка для главной и витрины (dev seed).',
      type: 'MANUAL',
      sortOrder: 10,
      visibility: 'VISIBLE',
    },
    update: {
      name: 'Избранное',
      description: 'Ручная подборка для главной и витрины (dev seed).',
      type: 'MANUAL',
      visibility: 'VISIBLE',
    },
  });

  await prisma.collectionProduct.deleteMany({ where: { collectionId: featured.id } });
  await prisma.collectionProduct.createMany({
    data: featuredProductIds.map((productId, index) => ({
      collectionId: featured.id,
      productId,
      sortOrder: index,
    })),
  });

  await prisma.collection.upsert({
    where: { slug: 'do-150' },
    create: {
      slug: 'do-150',
      name: 'До 150 BYN',
      description: 'Rule-based: минимальная активная цена ≤ 150 BYN.',
      type: 'RULE_BASED',
      rules: { maxPriceMinor: '15000', requirePublished: true },
      sortOrder: 20,
      visibility: 'VISIBLE',
    },
    update: {
      name: 'До 150 BYN',
      description: 'Rule-based: минимальная активная цена ≤ 150 BYN.',
      type: 'RULE_BASED',
      rules: { maxPriceMinor: '15000', requirePublished: true },
      visibility: 'VISIBLE',
    },
  });
}

async function upsertStorefront(prisma: PrismaClient): Promise<void> {
  const defaults = {
    brandName: 'БУКЕТ №1',
    city: 'Гродно',
    phone: '+375 (29) 000-00-00',
    email: 'hello@bouquet.local',
    address: 'г. Гродно (адрес уточняется)',
    workingHours: 'Ежедневно 9:00–21:00',
    deliverySummary:
      'Доставляем букеты по Гродно. После оформления заказа менеджер свяжется для подтверждения деталей.',
    aboutSummary:
      'БУКЕТ №1 — цветочный магазин в Гродно. Собираем букеты, которые хочется дарить: свежие цветы, аккуратная сборка, понятная доставка.',
    substitutionNote:
      'Цветы — сезонный продукт. Отдельные позиции могут быть заменены на равноценные с сохранением стиля, палитры и стоимости букета.',
  };

  const existingSettings = await prisma.storefrontSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (!existingSettings) {
    await prisma.storefrontSettings.create({
      data: { id: SINGLETON_ID, ...defaults },
    });
    console.log('Created StorefrontSettings defaults (phone placeholder +375…).');
  } else if (!existingSettings.phone) {
    await prisma.storefrontSettings.update({
      where: { id: SINGLETON_ID },
      data: { phone: defaults.phone },
    });
    console.log('Updated StorefrontSettings phone placeholder.');
  } else {
    console.log('StorefrontSettings already present — left intact.');
  }

  const existingHomepage = await prisma.homepageConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!existingHomepage) {
    const homepage = defaultHomepageConfig();
    homepage.sections.push({
      id: 'collection-featured',
      kind: 'collection',
      enabled: true,
      heading: 'Избранное',
      collectionSlug: 'izbrannoe',
      sortOrder: 15,
    });
    await prisma.homepageConfig.create({
      data: {
        id: SINGLETON_ID,
        config: homepage,
      },
    });
    console.log('Created HomepageConfig defaults.');
  } else {
    console.log('HomepageConfig already present — left intact.');
  }
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
    const styles = new Map<string, string>();
    const colors = new Map<string, string>();
    const categories = new Map<string, string>();

    for (const item of FLOWERS) {
      const row = await upsertTaxonomy(prisma, 'flower', item);
      flowers.set(row.slug, row.id);
    }
    for (const item of OCCASIONS) {
      const row = await upsertTaxonomy(prisma, 'occasion', item);
      occasions.set(row.slug, row.id);
    }
    for (const item of RECIPIENTS) {
      const row = await upsertTaxonomy(prisma, 'recipient', item);
      recipients.set(row.slug, row.id);
    }
    for (const item of STYLES) {
      const row = await upsertTaxonomy(prisma, 'style', item);
      styles.set(row.slug, row.id);
    }
    for (const item of COLORS) {
      const row = await upsertTaxonomy(prisma, 'color', item);
      colors.set(row.slug, row.id);
    }
    for (const item of CATEGORIES) {
      const row = await upsertTaxonomy(prisma, 'category', item);
      categories.set(row.slug, row.id);
    }

    const productIds: string[] = [];
    for (const bouquet of BOUQUETS) {
      const id = await upsertBouquet(
        prisma,
        bouquet,
        { flowers, occasions, recipients, styles, colors, categories },
        mediaRoot,
      );
      productIds.push(id);
      console.log(`Upserted product ${bouquet.slug}`);
    }

    const featuredIds = productIds.filter((_, index) => BOUQUETS[index]?.featured);
    await upsertCollections(prisma, featuredIds);
    console.log('Upserted collections izbrannoe (manual) and do-150 (rule-based).');

    await upsertStorefront(prisma);
    console.log(`Done. Seeded ${BOUQUETS.length} bouquets.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

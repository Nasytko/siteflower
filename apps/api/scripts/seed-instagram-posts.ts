/**
 * Dev helper: seed a few curated Instagram posts from published product media.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from '@bouquet-one/database';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL required');

  const prisma = await Promise.resolve(createPrismaClient({ connectionString: databaseUrl }));
  try {
    const existing = await prisma.instagramPost.count();
    if (existing > 0) {
      console.log(`EXISTING=${existing}`);
    } else {
      const products = await prisma.product.findMany({
        where: { lifecycle: 'PUBLISHED' },
        take: 6,
        include: {
          media: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 1,
            include: { mediaAsset: true },
          },
        },
      });

      let seeded = 0;
      for (const product of products) {
        const asset = product.media[0]?.mediaAsset;
        if (!asset) continue;
        const imageUrl = `http://127.0.0.1:3001/api/v1/media/${asset.id}`;
        await prisma.instagramPost.create({
          data: {
            imageUrl,
            postUrl: 'https://www.instagram.com/',
            caption: product.name.slice(0, 80),
            enabled: true,
            sortOrder: seeded,
          },
        });
        seeded += 1;
        if (seeded >= 3) break;
      }
      console.log(`SEEDED=${seeded}`);
    }

    const settings = await prisma.storefrontSettings.findFirst();
    if (settings && !settings.instagramUrl) {
      await prisma.storefrontSettings.update({
        where: { id: settings.id },
        data: { instagramUrl: 'https://www.instagram.com/bouquet1/' },
      });
      console.log('IG_URL_SET=https://www.instagram.com/bouquet1/');
    } else {
      console.log(`IG_URL=${settings?.instagramUrl ?? 'none'}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

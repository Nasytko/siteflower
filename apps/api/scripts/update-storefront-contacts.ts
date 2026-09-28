/**
 * One-shot: set live storefront contact details.
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
    const row = await prisma.storefrontSettings.update({
      where: { id: 1 },
      data: {
        brandName: 'BUKET №1',
        phone: '+375 (29) 798-22-22',
        address: 'пр-т Янки Купалы, 67А, г. Гродно, 230000',
        workingHours: '9:00–21:00',
        city: 'Гродно',
        aboutSummary:
          'BUKET №1 — цветочный магазин в Гродно. Собираем букеты, которые хочется дарить: свежие цветы, аккуратная сборка, понятная доставка.',
      },
    });
    console.log(
      JSON.stringify(
        {
          brand: row.brandName,
          phone: row.phone,
          address: row.address,
          hours: row.workingHours,
          city: row.city,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Dev helper: upsert SUPER_ADMIN with a given password from env.
 * ADMIN_RESET_EMAIL, ADMIN_RESET_PASSWORD, DATABASE_URL
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from '@bouquet-one/database';
import { hashPassword, normalizeEmail, PASSWORD_MIN_LENGTH } from '../auth/crypto.util';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  const emailRaw = process.env.ADMIN_RESET_EMAIL;
  const password = process.env.ADMIN_RESET_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;

  if (!emailRaw || !password || !databaseUrl) {
    throw new Error('ADMIN_RESET_EMAIL, ADMIN_RESET_PASSWORD, DATABASE_URL required');
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  const email = normalizeEmail(emailRaw);
  const prisma = await Promise.resolve(createPrismaClient({ connectionString: databaseUrl }));
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.adminUser.upsert({
      where: { email },
      create: {
        email,
        displayName: 'Админ',
        passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
      update: {
        passwordHash,
        status: 'ACTIVE',
        displayName: 'Админ',
      },
    });
    console.log(`ADMIN_READY=${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

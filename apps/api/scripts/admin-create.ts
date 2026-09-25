#!/usr/bin/env node
/**
 * Production-safe bootstrap for the first SUPER_ADMIN.
 * Never invents a default password. Never runs during app startup.
 *
 * Usage:
 *   pnpm admin:create --email admin@example.com --name "Director"
 *   # interactive password prompt (preferred — avoids shell history / process list)
 *   pnpm admin:create --email admin@example.com --name "Director" --password "..."
 *   # --password is for automation only; prefer interactive or ADMIN_BOOTSTRAP_PASSWORD in CI
 *
 * Dev-only env fallback (rejected when NODE_ENV=production):
 *   ADMIN_BOOTSTRAP_PASSWORD
 *
 * Never print the password.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from '@bouquet-one/database';
import {
  hashPassword,
  normalizeEmail,
  PASSWORD_MIN_LENGTH,
} from '../src/auth/crypto.util';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function promptPassword(): Promise<string> {
  if (process.env.NODE_ENV !== 'production' && process.env.ADMIN_BOOTSTRAP_PASSWORD) {
    return process.env.ADMIN_BOOTSTRAP_PASSWORD;
  }
  if (!process.stdin.isTTY) {
    throw new Error('Password must be provided via --password in non-interactive mode');
  }
  const rl = createInterface({ input, output });
  const password = await rl.question('Password: ');
  rl.close();
  return password;
}

async function main(): Promise<void> {
  const emailRaw = readArg('--email');
  const displayName = readArg('--name');
  let password = readArg('--password');

  if (!emailRaw || !displayName) {
    throw new Error('Usage: pnpm admin:create --email <email> --name <displayName> [--password <password>]');
  }

  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_BOOTSTRAP_PASSWORD) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD is not allowed when NODE_ENV=production');
  }

  if (!password) {
    password = await promptPassword();
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const email = normalizeEmail(emailRaw);
  const prisma = await Promise.resolve(
    createPrismaClient({ connectionString: databaseUrl }),
  );

  try {
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      throw new Error(`Admin user already exists: ${email}`);
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.adminUser.create({
      data: {
        email,
        displayName: displayName.trim(),
        passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });

    await prisma.auditLog.create({
      data: {
        actorAdminUserId: user.id,
        action: 'ADMIN_USER_CREATED',
        entityType: 'AdminUser',
        entityId: user.id,
        metadata: { bootstrap: true, role: 'SUPER_ADMIN' },
      },
    });

    console.log(`Created SUPER_ADMIN ${user.email} (${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

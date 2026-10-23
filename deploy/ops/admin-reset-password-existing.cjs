#!/usr/bin/env node
/**
 * ONE-SHOT ops helper: reset passwordHash for an EXISTING AdminUser only.
 *
 * - Does NOT upsert / create users
 * - Does NOT change role, status, or displayName
 * - Uses the same hashPassword() as the API (argon2id via dist/auth/crypto.util)
 * - Never prints the password or hash
 *
 * Intended to run inside the running shopbuket1-api container (cwd /app):
 *   node /tmp/admin-reset-password-existing.cjs --email admin@example.com
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { stdin, stdout, stderr } = require('node:process');

const APP_ROOT = '/app';

if (!fs.existsSync(path.join(APP_ROOT, 'package.json'))) {
  throw new Error(
    `Expected ${APP_ROOT}/package.json — run inside shopbuket1-api with -w /app`,
  );
}

// Resolve deps from /app even when this file lives in /tmp.
const appRequire = createRequire(path.join(APP_ROOT, 'package.json'));
const { createPrismaClient } = appRequire('@bouquet-one/database');
const {
  hashPassword,
  normalizeEmail,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} = appRequire('./dist/auth/crypto.util');

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

/**
 * Hidden TTY password prompt (no echo). Node built-ins only — no extra packages.
 */
function promptHidden(label) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || !stdout.isTTY) {
      reject(new Error('Interactive TTY required for hidden password entry'));
      return;
    }

    stdout.write(label);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');

    let value = '';

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk) => {
      const s = String(chunk);
      for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        const code = ch.charCodeAt(0);

        // Enter
        if (ch === '\r' || ch === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        // Ctrl+C
        if (code === 3) {
          cleanup();
          stdout.write('\n');
          reject(new Error('Interrupted'));
          return;
        }
        // Backspace / DEL
        if (code === 127 || code === 8) {
          if (value.length > 0) {
            value = value.slice(0, -1);
          }
          continue;
        }
        // Ignore other controls
        if (code < 32) {
          continue;
        }
        value += ch;
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const emailRaw = readArg('--email');
  if (!emailRaw) {
    throw new Error(
      'Usage: node /tmp/admin-reset-password-existing.cjs --email <existing-admin-email>',
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required inside the API container');
  }

  const email = normalizeEmail(emailRaw);
  stderr.write(`Looking up admin by email (normalized)...\n`);

  const prisma = await Promise.resolve(
    createPrismaClient({ connectionString: databaseUrl }),
  );

  try {
    const user = await prisma.adminUser.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        displayName: true,
      },
    });

    if (!user) {
      stderr.write(
        `No admin user found for that email. No changes were made.\n`,
      );
      process.exitCode = 2;
      return;
    }

    // Report only non-secret identity fields; do not change them.
    stderr.write(
      `Found admin id=${user.id} role=${user.role} status=${user.status} (displayName unchanged).\n`,
    );

    const password = await promptHidden('New password (hidden): ');
    const confirm = await promptHidden('Confirm password (hidden): ');

    if (password !== confirm) {
      throw new Error('Passwords do not match. No changes were made.');
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new Error(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters. No changes were made.`,
      );
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      throw new Error(
        `Password must be at most ${PASSWORD_MAX_LENGTH} characters. No changes were made.`,
      );
    }

    const passwordHash = await hashPassword(password);

    const result = await prisma.adminUser.updateMany({
      where: { id: user.id, email: user.email },
      data: { passwordHash },
    });

    if (result.count !== 1) {
      throw new Error(
        `Expected to update 1 row, updated ${result.count}. Investigate before retrying.`,
      );
    }

    // Success: identity only — never password or hash.
    stdout.write(
      `PASSWORD_UPDATED email=${user.email} id=${user.id} role=${user.role} status=${user.status}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // Avoid dumping stacks that might echo env; message only.
  stderr.write(`${message}\n`);
  process.exit(1);
});

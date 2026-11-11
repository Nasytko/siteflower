/**
 * Production entry for `output: 'standalone'` (matches deploy/Dockerfile.web).
 * Copies static/public next to the traced server, then runs node apps/web/server.js.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const standaloneRoot = join(webRoot, '.next', 'standalone');
const serverJs = join(standaloneRoot, 'apps', 'web', 'server.js');

if (!existsSync(serverJs)) {
  console.error(
    `Missing ${serverJs}. Run: pnpm --filter @bouquet-one/web build`,
  );
  process.exit(1);
}

const staticSrc = join(webRoot, '.next', 'static');
const staticDest = join(standaloneRoot, 'apps', 'web', '.next', 'static');
const publicSrc = join(webRoot, 'public');
const publicDest = join(standaloneRoot, 'apps', 'web', 'public');

mkdirSync(dirname(staticDest), { recursive: true });
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDest, { recursive: true });
}
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
}

const port = process.env.PORT ?? '3000';
const child = spawn(process.execPath, ['apps/web/server.js'], {
  cwd: standaloneRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    HOSTNAME: process.env.HOSTNAME ?? '0.0.0.0',
  },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

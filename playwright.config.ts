import { defineConfig, devices } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001';

/** Prefer system Chrome when Playwright CDN Chromium install is blocked. */
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === 'true';

/** Stable non-production secrets so `NODE_ENV=production` API boot is valid for local E2E. */
const e2eSessionHmac =
  process.env.SESSION_HMAC_SECRET &&
  process.env.SESSION_HMAC_SECRET.length >= 32 &&
  !process.env.SESSION_HMAC_SECRET.includes('dev-only') &&
  !process.env.SESSION_HMAC_SECRET.includes('change-me')
    ? process.env.SESSION_HMAC_SECRET
    : 'e2e-only-session-hmac-secret-32chars-min';
const e2eRecoveryKey =
  process.env.ORDER_RECOVERY_ENCRYPTION_KEY ??
  Buffer.from('e2e-recovery-key-32-bytes-exact!').toString('base64');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Visual screenshot matrix is opt-in (RUN_VISUAL_QA=true or explicit path to the file).
  testIgnore:
    process.env.RUN_VISUAL_QA === 'true' ||
    process.argv.some((arg) => arg.replace(/\\/g, '/').includes('visual-qa'))
      ? []
      : ['**/visual-qa.spec.ts'],
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(useSystemChrome ? { channel: 'chrome' as const } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Mobile project is for commerce viewport coverage only — avoid re-running smoke/storefront.
      name: 'mobile-chrome',
      testMatch: /commerce\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        ...(useSystemChrome ? { channel: 'chrome' as const } : {}),
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @bouquet-one/api start',
      url: `${apiUrl}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        API_PORT: '3001',
        CORS_ORIGINS: `${webUrl},http://localhost:3000`,
        SWAGGER_ENABLED: 'false',
        TRUST_PROXY: 'false',
        LOG_LEVEL: 'error',
        SESSION_HMAC_SECRET: e2eSessionHmac,
        ORDER_RECOVERY_ENCRYPTION_KEY: e2eRecoveryKey,
        // Local E2E uses filesystem media; production still requires S3 unless explicitly opted in.
        ALLOW_PRODUCTION_LOCAL_MEDIA: 'true',
        MEDIA_STORAGE: process.env.MEDIA_STORAGE ?? 'local',
        MEDIA_LOCAL_ROOT: process.env.MEDIA_LOCAL_ROOT ?? './storage/media',
        MEDIA_PUBLIC_BASE_URL:
          process.env.MEDIA_PUBLIC_BASE_URL ?? `${apiUrl}/api/v1/media`,
      },
    },
    {
      command: 'pnpm --filter @bouquet-one/web start',
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: webUrl,
        ALLOW_INDEXING: 'false',
        API_URL: apiUrl,
        // Local seed media uses 127.0.0.1/localhost; Next/Image blocks private IPs in production unless opted in.
        ALLOW_LOCAL_IMAGE_IP: 'true',
        REVALIDATE_SECRET:
          process.env.REVALIDATE_SECRET && process.env.REVALIDATE_SECRET.length >= 16
            ? process.env.REVALIDATE_SECRET
            : 'e2e-only-revalidate-secret',
      },
    },
  ],
});

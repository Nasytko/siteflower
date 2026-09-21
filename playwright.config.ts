import { defineConfig, devices } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001';

/** Prefer system Chrome when Playwright CDN Chromium install is blocked. */
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === 'true';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
    ...(useSystemChrome ? { channel: 'chrome' as const } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
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
        CORS_ORIGINS: webUrl,
        SWAGGER_ENABLED: 'false',
        TRUST_PROXY: 'false',
        LOG_LEVEL: 'error',
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
      },
    },
  ],
});

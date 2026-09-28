/**
 * Playwright: Admin ERP integration control plane (simulator).
 * Requires: API+web running, SUPER_ADMIN credentials, INTEGRATION_MODE=SIMULATOR optional.
 */
import { expect, test } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

test.describe('Admin ERP integration', () => {
  test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL/PASSWORD not set');

  test('SUPER_ADMIN can open ERP dashboard', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`${webUrl}/admin/login`);
    await page.getByLabel('Email').fill(adminEmail!);
    await page.getByLabel('Password').fill(adminPassword!);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL(/\/admin/, { timeout: 20_000 });

    await page.goto(`${webUrl}/admin/integrations/erp`);
    await expect(page.getByRole('heading', { name: /ERP|Интеграц/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Очередь|Режим|Статус/i).first()).toBeVisible();
  });
});

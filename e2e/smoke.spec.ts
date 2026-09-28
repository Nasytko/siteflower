import { expect, test } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001';
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

async function adminLogin(page: import('@playwright/test').Page) {
  await page.goto(`${webUrl}/admin/login`);
  await page.getByLabel('Email').fill(adminEmail!);
  await page.getByLabel('Password').fill(adminPassword!);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL((url) => /\/admin\/?$/.test(url.pathname) || /\/admin\/(?!login)/.test(url.pathname), {
    timeout: 20_000,
  });
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible({ timeout: 15_000 });
}

test('web storefront home loads with brand', async ({ page }) => {
  await page.goto(webUrl);
  await expect(page.getByRole('img', { name: 'BUKET №1' }).first()).toBeVisible();
  await expect(page.locator('#main-content')).toBeVisible();
});

test('api health endpoint works', async ({ request }) => {
  const response = await request.get(`${apiUrl}/api/v1/health`);
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.status).toBe('ok');
});

test('admin login → dashboard → users → logout', async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL/PASSWORD not set');
  test.setTimeout(60_000);

  await adminLogin(page);
  await page.goto(`${webUrl}/admin/users`);
  await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.waitForURL(/\/admin\/login/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'BUKET №1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
});

test('admin catalog products page loads when authenticated', async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL/PASSWORD not set');
  test.setTimeout(60_000);

  await adminLogin(page);
  await page.goto(`${webUrl}/admin/catalog/products`);
  await expect(page.getByRole('heading', { name: 'Товары' })).toBeVisible({ timeout: 15_000 });
});

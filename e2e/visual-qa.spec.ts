/**
 * Phase 3.1 visual QA screenshot capture (system Chrome).
 * Requires API+web already running with seeded catalog.
 */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';
const outDir = path.resolve('artifacts/visual-qa');

const VIEWPORTS = {
  'mobile-375': { width: 375, height: 812 },
  'mobile-390': { width: 390, height: 844 },
  'mobile-430': { width: 430, height: 932 },
  'tablet-768': { width: 768, height: 1024 },
  'laptop-1024': { width: 1024, height: 768 },
  'desktop-1440': { width: 1440, height: 900 },
} as const;

async function shot(page: Page, name: string, fullPage = true) {
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

test('visual QA capture matrix', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop chrome project only');

  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  await page.setViewportSize(VIEWPORTS['desktop-1440']);
  await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'БУКЕТ №1' }).first()).toBeVisible();
  await shot(page, 'desktop-1440-home');

  await page.goto(`${webUrl}/bukety`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Каталог букетов' })).toBeVisible();
  await shot(page, 'desktop-1440-catalog');

  await page.goto(`${webUrl}/bukety/ameli`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(page, 'desktop-1440-product-ameli');

  await page.getByRole('button', { name: 'Добавить в корзину' }).click();
  await page.goto(`${webUrl}/cart`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'desktop-1440-cart');
  await page.goto(`${webUrl}/checkout`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Доставка' }).click();
  await shot(page, 'desktop-1440-checkout-delivery');
  await page.getByRole('button', { name: 'Самовывоз' }).click();
  await shot(page, 'desktop-1440-checkout-pickup');

  await page.goto(`${webUrl}/favorites`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'desktop-1440-favorites');

  await page.goto(`${webUrl}/dostavka`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'desktop-1440-dostavka');

  await page.goto(`${webUrl}/o-nas`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'desktop-1440-o-nas');

  await page.goto(`${webUrl}/collections/izbrannoe`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'desktop-1440-collection');

  await page.goto(`${webUrl}/povod/den-rozhdeniya`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'desktop-1440-occasion');

  await page.goto(`${webUrl}/komu/mame`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'desktop-1440-recipient');

  await page.goto(`${webUrl}/cvety/rozy`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'desktop-1440-flower');

  await page.setViewportSize(VIEWPORTS['mobile-390']);
  await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
  await shot(page, 'mobile-390-home');

  await page.goto(`${webUrl}/bukety`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'mobile-390-catalog');

  await page.getByRole('button', { name: 'Фильтры' }).click();
  await expect(page.getByRole('dialog', { name: 'Фильтры каталога' })).toBeVisible();
  // Viewport-only: fixed overlays are misrepresented by fullPage stitching.
  await shot(page, 'mobile-390-filters-open', false);
  await page.getByRole('button', { name: 'Закрыть фильтры' }).click();

  await page.getByRole('button', { name: /Найти букет/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, 'mobile-390-search-open', false);
  await page.keyboard.press('Escape');

  await page.goto(`${webUrl}/bukety/ameli`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'mobile-390-product-ameli');

  // Phase 4 commerce surfaces
  await page.getByRole('button', { name: 'Добавить в корзину' }).click();
  await page.goto(`${webUrl}/cart`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'mobile-390-cart');
  await page.goto(`${webUrl}/checkout`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Доставка' }).click();
  await shot(page, 'mobile-390-checkout');

  await page.goto(`${webUrl}/favorites`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'mobile-390-favorites');

  for (const key of ['mobile-375', 'mobile-430'] as const) {
    await page.setViewportSize(VIEWPORTS[key]);
    await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
    await shot(page, `${key}-home`);
    await page.goto(`${webUrl}/bukety`, { waitUntil: 'domcontentloaded' });
    await shot(page, `${key}-catalog`);
  }

  for (const key of ['tablet-768', 'laptop-1024'] as const) {
    await page.setViewportSize(VIEWPORTS[key]);
    await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
    await shot(page, `${key}-home`);
    await page.goto(`${webUrl}/bukety`, { waitUntil: 'domcontentloaded' });
    await shot(page, `${key}-catalog`);
    await page.goto(`${webUrl}/bukety/ameli`, { waitUntil: 'domcontentloaded' });
    await shot(page, `${key}-product`);
  }

  await page.setViewportSize(VIEWPORTS['mobile-375']);
  await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  expect(overflow).toBe(false);

  fs.writeFileSync(
    path.join(outDir, 'runtime-audit.json'),
    JSON.stringify({ consoleErrors, failedRequests: [...new Set(failedRequests)].slice(0, 40) }, null, 2),
  );
});

test('admin visual QA capture', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop chrome only');
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, 'E2E_ADMIN_EMAIL/PASSWORD not set');
  test.setTimeout(120_000);

  await page.setViewportSize(VIEWPORTS['desktop-1440']);
  await page.goto(`${webUrl}/admin/login`);
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL((url) => /\/admin\/?$/.test(url.pathname) || /\/admin\/(?!login)/.test(url.pathname), {
    timeout: 20_000,
  });
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible({ timeout: 15_000 });
  await shot(page, 'desktop-1440-admin-dashboard');

  await page.goto(`${webUrl}/admin/catalog/products`);
  await expect(page.getByRole('heading', { name: 'Товары' })).toBeVisible({ timeout: 15_000 });
  await shot(page, 'desktop-1440-admin-products');

  const editLink = page.locator('a[href*="/admin/catalog/products/"]').filter({ hasNotText: 'Товары' }).first();
  if (await editLink.count()) {
    await editLink.click();
    await page.waitForURL(/\/admin\/catalog\/products\//, { timeout: 15_000 });
    await shot(page, 'desktop-1440-admin-product-editor');
  }

  await page.goto(`${webUrl}/admin/storefront/homepage`);
  await expect(page.getByRole('heading', { name: 'Главная витрины' })).toBeVisible({ timeout: 15_000 });
  await shot(page, 'desktop-1440-admin-homepage');

  await page.goto(`${webUrl}/admin/storefront/settings`);
  await expect(page.getByRole('heading', { name: 'Настройки витрины' })).toBeVisible({ timeout: 15_000 });
  await shot(page, 'desktop-1440-admin-settings');

  await page.goto(`${webUrl}/admin/orders?date=all`);
  await expect(page.getByRole('heading', { name: 'Заказы' })).toBeVisible({ timeout: 15_000 });
  await shot(page, 'desktop-1440-admin-orders');
  const orderLink = page.locator('a[href^="/admin/orders/"]').first();
  if (await orderLink.count()) {
    await orderLink.click();
    await page.waitForURL(/\/admin\/orders\//, { timeout: 15_000 });
    await shot(page, 'desktop-1440-admin-order-detail');
  }

  await page.setViewportSize(VIEWPORTS['tablet-768']);
  await page.goto(`${webUrl}/admin/catalog/products`);
  await expect(page.getByRole('heading', { name: 'Товары' })).toBeVisible({ timeout: 15_000 });
  await shot(page, 'tablet-768-admin-products');
});

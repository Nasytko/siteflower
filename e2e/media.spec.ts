/**
 * Media production Playwright E2E — system Chrome.
 * Requires API+web, E2E_ADMIN_EMAIL/PASSWORD, seeded catalog for global-setup.
 */
import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const requireFromApi = createRequire(path.resolve('apps/api/package.json'));
const sharp = requireFromApi('sharp') as typeof import('sharp');

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001';
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const outDir = path.resolve('artifacts/media-visual-qa');

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
] as const;

async function adminLogin(page: Page) {
  await page.goto(`${webUrl}/admin/login`);
  await page.getByLabel('Email').fill(adminEmail!);
  await page.getByLabel('Пароль').fill(adminPassword!);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(
    (url) => /\/admin\/?$/.test(url.pathname) || /\/admin\/(?!login)/.test(url.pathname),
    { timeout: 20_000 },
  );
}

async function makePng(width: number, height: number, filePath: string) {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 60, b: 90 },
    },
  })
    .png()
    .toFile(filePath);
}

test.describe('Media production E2E', () => {
  test('full Admin gallery → publish → catalog/PDP + invalid uploads', async ({ page }, testInfo) => {
    test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL/PASSWORD not set');
    test.skip(testInfo.project.name !== 'chromium', 'Desktop chrome');
    test.setTimeout(240_000);

    const tmp = path.resolve('artifacts/media-e2e-tmp');
    fs.mkdirSync(tmp, { recursive: true });
    const img1 = path.join(tmp, 'one.png');
    const img2 = path.join(tmp, 'two.png');
    const img3 = path.join(tmp, 'three.png');
    await Promise.all([makePng(800, 1000, img1), makePng(900, 900, img2), makePng(700, 900, img3)]);

    const stamp = Date.now();
    const name = `E2E Media ${stamp}`;
    const slug = `e2e-media-${stamp}`;

    await adminLogin(page);

    // Admin mutations via web origin (Next rewrite) so session cookies attach over http.
    const adminApi = webUrl;
    const createRes = await page.request.post(`${adminApi}/api/v1/admin/catalog/products`, {
      data: { name, slug },
      headers: { Origin: webUrl },
    });
    expect(createRes.ok()).toBeTruthy();
    const product = await createRes.json();
    const productId = product.id as string;

    await page.goto(`${webUrl}/admin/catalog/products/${productId}`);
    await page.getByRole('button', { name: /^Фото$/i }).click();
    await expect(page.getByText(/из 12 фотографий/i)).toBeVisible();

    const fileInput = page.locator('input[type="file"][accept*="image"]');
    await fileInput.setInputFiles(img1);
    await expect(page.locator('.admin-media-card')).toHaveCount(1, { timeout: 45_000 });

    await fileInput.setInputFiles([img2, img3]);
    await expect(page.locator('.admin-media-card')).toHaveCount(3, { timeout: 90_000 });

    const alt = page.locator('.admin-media-card').first().getByPlaceholder(/Букет/);
    await alt.fill('Букет для e2e');
    await Promise.all([
      page
        .waitForResponse(
          (res) =>
            res.url().includes('/api/v1/admin/catalog/products/') &&
            res.request().method() === 'PATCH' &&
            res.ok(),
          { timeout: 15_000 },
        )
        .catch(() => undefined),
      alt.blur(),
    ]);

    const makePrimary = page.getByRole('button', { name: /Сделать главным/i }).first();
    if (await makePrimary.count()) {
      await makePrimary.click();
      await expect(page.getByText(/★ Главное/i).first()).toBeVisible({ timeout: 15_000 });
    }

    const later = page.getByRole('button', { name: 'Позже' }).first();
    if ((await later.count()) && (await later.isEnabled())) {
      await later.click();
      await expect(later).toBeHidden({ timeout: 15_000 }).catch(() => undefined);
    }

    // Invalid SVG
    const svgPath = path.join(tmp, 'bad.svg');
    fs.writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
    await fileInput.setInputFiles(svgPath);
    await expect(page.getByText(/JPG|PNG|WebP|AVIF|изображен|ошибк|Не удалось/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.admin-media-card')).toHaveCount(3);

    // Corrupted jpeg
    const corruptPath = path.join(tmp, 'corrupt.jpg');
    fs.writeFileSync(corruptPath, Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]));
    await fileInput.setInputFiles(corruptPath);
    await expect(page.getByText(/Некоррект|поврежд|ошибк|Не удалось|подверж/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.admin-media-card')).toHaveCount(3);

    // Variants + publish
    await page.getByRole('button', { name: /Вариант|Основн|Цены/i }).first().click().catch(() => undefined);
    const variantsTab = page.getByRole('button', { name: /^Варианты$/i });
    if (await variantsTab.count()) {
      await variantsTab.click();
    }
    const productGet = await page.request.get(`${adminApi}/api/v1/admin/catalog/products/${productId}`);
    const current = await productGet.json();
    await page.request.put(`${adminApi}/api/v1/admin/catalog/products/${productId}/variants`, {
      data: {
        expectedVersion: current.version,
        variants: [{ name: 'S', priceMinor: '12900', sortOrder: 0, status: 'ACTIVE' }],
      },
      headers: { Origin: webUrl },
    });
    const afterVar = await (
      await page.request.get(`${adminApi}/api/v1/admin/catalog/products/${productId}`)
    ).json();
    await page.request.patch(`${adminApi}/api/v1/admin/catalog/products/${productId}`, {
      data: {
        expectedVersion: afterVar.version,
        shortDescription: 'E2E media bouquet',
        description: 'E2E media bouquet full description',
      },
      headers: { Origin: webUrl },
    });
    const afterPatch = await (
      await page.request.get(`${adminApi}/api/v1/admin/catalog/products/${productId}`)
    ).json();
    const pub = await page.request.post(`${adminApi}/api/v1/admin/catalog/products/${productId}/publish`, {
      data: { expectedVersion: afterPatch.version },
      headers: { Origin: webUrl },
    });
    expect(pub.ok()).toBeTruthy();

    const list = await page.request.get(
      `${apiUrl}/api/v1/catalog/products?search=${encodeURIComponent(name)}`,
    );
    expect(list.ok()).toBeTruthy();
    const listBody = await list.json();
    const item = (listBody.items ?? []).find((i: { slug: string }) => i.slug === slug);
    expect(item?.primaryImageUrl).toBeTruthy();
    expect(String(item.primaryImageUrl)).not.toMatch(/w1600/);

    const revalidateSecret = process.env.REVALIDATE_SECRET;
    if (revalidateSecret && revalidateSecret.length >= 16) {
      await page.request.post(`${webUrl}/api/revalidate`, {
        data: { paths: ['/bukety', `/bukety/${slug}`], tags: ['catalog', 'storefront'] },
        headers: { 'x-revalidate-secret': revalidateSecret },
      });
    }

    await page.goto(`${webUrl}/bukety/${slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('img').first()).toBeVisible();

    const detail = await page.request.get(`${apiUrl}/api/v1/catalog/products/${slug}`);
    const detailBody = await detail.json();
    const productDto = detailBody.product ?? detailBody;
    const primary = (productDto.media ?? []).find((m: { isPrimary: boolean }) => m.isPrimary);
    expect(primary).toBeTruthy();
    expect(primary.derivatives?.length ?? 0).toBeGreaterThan(0);
    expect(primary.width).toBeTruthy();
    expect(primary.height).toBeTruthy();

    const meta = await page.content();
    expect(meta).toMatch(/og:image|property="og:image"/i);

    fs.mkdirSync(outDir, { recursive: true });
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${webUrl}/bukety`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.sf-product-card').first()).toBeVisible({ timeout: 15_000 });
      await page.screenshot({
        path: path.join(outDir, `${vp.name}-catalog.png`),
        fullPage: true,
      });
      await page.goto(`${webUrl}/bukety/${slug}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      await page.screenshot({
        path: path.join(outDir, `${vp.name}-pdp.png`),
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${webUrl}/admin/catalog/products/${productId}`);
    await page.getByRole('button', { name: /^Фото$/i }).click();
    await page.screenshot({
      path: path.join(outDir, '1440x900-admin-gallery.png'),
      fullPage: true,
    });

    const del = page.getByRole('button', { name: /^Удалить$/i }).last();
    page.once('dialog', (d) => d.accept());
    if (await del.count()) {
      await del.click();
      await expect(page.locator('.admin-media-card')).toHaveCount(2, { timeout: 20_000 });
    }
  });

  test('media health probe', async ({ page }) => {
    test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL/PASSWORD not set');
    test.setTimeout(60_000);
    await adminLogin(page);
    await page.goto(`${webUrl}/admin/media-health`);
    await expect(page.getByText(/Хранилище фотографий/i)).toBeVisible();
    await page.getByRole('button', { name: /Проверить хранилище/i }).click();
    await expect(page.getByText(/Запись/i)).toBeVisible({ timeout: 20_000 });
  });
});

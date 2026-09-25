/**
 * Phase 3.1 expanded storefront E2E (system Chrome).
 */
import { expect, test } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';

test.describe('storefront catalog journey', () => {
  test('home → catalog → filter → product → variant → favorite → favorites', async ({ page }) => {
    await page.goto(webUrl);
    await expect(page.getByText(/БУКЕТ\s*№?\s*1/i).first()).toBeVisible();
    await expect(page.locator('#main-content')).toBeVisible();

    await page.goto(`${webUrl}/bukety`);
    await expect(page).toHaveURL(/\/bukety/);
    await expect(page.getByRole('heading', { name: 'Букеты' })).toBeVisible();

    // Search from header
    await page.getByRole('button', { name: /Найти букет/i }).click();
    await page.getByPlaceholder('Найти букет или цветы').fill('Амели');
    await expect(page.getByRole('link', { name: /Амели/i }).first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');

    await page.goto(`${webUrl}/bukety?band=100-150`);
    await expect(page.getByRole('heading', { name: 'Букеты' })).toBeVisible();

    const productLink = page.locator('main a[href^="/bukety/"]').first();
    const href = await productLink.getAttribute('href');
    test.skip(!href || href === '/bukety', 'No published products — seed required');

    await page.goto(`${webUrl}${href}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const variantOption = page.getByRole('listbox', { name: 'Варианты букета' }).getByRole('option').nth(1);
    if (await variantOption.count()) {
      await variantOption.click();
      await expect(variantOption).toHaveAttribute('aria-selected', 'true');
    }
    await expect(page.getByRole('listbox', { name: 'Упаковка' })).toBeVisible();

    const favorite = page.locator('main').first().locator('[data-favorite]').first();
    await favorite.click();
    await expect(favorite).toHaveAttribute('data-favorite', '1', { timeout: 10_000 });

    const stored = await page.evaluate(() => window.localStorage.getItem('bouquet-one:favorites:v1'));
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).items.length).toBeGreaterThan(0);

    await page.goto(`${webUrl}/favorites`);
    await expect(page.getByRole('heading', { name: 'Избранное' })).toBeVisible();
    await expect(page.getByText('Здесь пока пусто')).toHaveCount(0);
  });

  test('mobile home → catalog → filters → product', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(webUrl);
    await expect(page.getByText(/БУКЕТ\s*№?\s*1/i).first()).toBeVisible();

    await page.goto(`${webUrl}/bukety`);
    await expect(page.getByRole('heading', { name: 'Букеты' })).toBeVisible();
    await page.getByRole('button', { name: 'Фильтры' }).click();
    await expect(page.getByRole('dialog', { name: 'Фильтры каталога' })).toBeVisible();
    await page.getByRole('button', { name: 'Показать' }).click();

    const productLink = page.locator('main a[href^="/bukety/"]').first();
    const href = await productLink.getAttribute('href');
    test.skip(!href, 'No products');
    await page.goto(`${webUrl}${href}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

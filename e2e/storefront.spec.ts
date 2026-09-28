/**
 * Phase 3.1 expanded storefront E2E (system Chrome).
 */
import { expect, test } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';

test.describe('storefront catalog journey', () => {
  test('home → catalog → filter → product → variant → favorite → favorites', async ({ page }) => {
    await page.goto(webUrl);
    await expect(page.getByRole('img', { name: /BUKET\s*№?\s*1/i }).first()).toBeVisible();
    await expect(page.locator('#main-content')).toBeVisible();

    // Bestsellers tabs (seeded groups like «Все» / «Розы») when present
    const bestsellerTabs = page.getByRole('tablist', { name: 'Подборки бестселлеров' });
    if (await bestsellerTabs.count()) {
      const tabs = bestsellerTabs.getByRole('tab');
      await expect(tabs.first()).toBeVisible();
      if ((await tabs.count()) > 1) {
        await tabs.nth(1).click();
        // Selection should move; tolerate slow client paint after navigation from cold start.
        await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
      }
    }

    await page.goto(`${webUrl}/bukety`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/bukety/);
    await expect(page.getByRole('heading', { name: 'Букеты' })).toBeVisible({ timeout: 15_000 });

    // Desktop discovery pills (budget / occasion / …)
    const budgetPill = page.getByRole('button', { name: /^Бюджет/ });
    if (await budgetPill.count()) {
      await budgetPill.first().click();
      await page.keyboard.press('Escape');
    }

    // Search from header
    await page.getByRole('button', { name: /Найти букет/i }).click();
    await page.getByPlaceholder('Найти букет или цветы').fill('Амели');
    await expect(page.getByRole('link', { name: /Амели/i }).first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');

    await page.goto(`${webUrl}/bukety?sort=price_asc`);
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
    // Packaging is not a commercial order option — only catalog variants are selectable.
    await expect(page.getByRole('listbox', { name: 'Упаковка' })).toHaveCount(0);
    await expect(page.getByTestId('add-to-cart')).toBeVisible();

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

  test('promotions hub /akcii', async ({ page }) => {
    await page.goto(`${webUrl}/akcii`);
    await expect(page).toHaveURL(/\/akcii/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Seeded PERCENT/FIXED promotions should surface at least one card when catalog is seeded.
    const promoCard = page.locator('main a[href^="/bukety/"]').first();
    if (await promoCard.count()) {
      await expect(promoCard).toBeVisible();
    }
  });

  test('mobile home → catalog → filters → product', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(webUrl);
    await expect(page.getByRole('img', { name: /BUKET\s*№?\s*1/i }).first()).toBeVisible();

    await page.goto(`${webUrl}/bukety`);
    await expect(page.getByRole('heading', { name: 'Букеты' })).toBeVisible();
    const filtersTrigger = page.getByRole('button', { name: /^Фильтры/ }).first();
    await expect(filtersTrigger).toBeVisible();
    await filtersTrigger.click();
    await expect(page.getByRole('dialog', { name: 'Фильтры каталога' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /^Показать / }).click();
    await expect(page.getByRole('dialog', { name: 'Фильтры каталога' })).toHaveCount(0);

    const productLink = page.locator('main a[href^="/bukety/"]').first();
    const href = await productLink.getAttribute('href');
    test.skip(!href, 'No products');
    await page.goto(`${webUrl}${href}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

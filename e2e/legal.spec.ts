/**
 * Playwright: legal pages + checkout acknowledgement (no online payment claims).
 */
import { expect, test } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';

test.describe('Belarus legal storefront', () => {
  test('footer legal links resolve without 404', async ({ page }) => {
    await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
    const paths = ['/kontakty', '/dostavka', '/oferta', '/vozvrat', '/privacy'];
    for (const path of paths) {
      const response = await page.goto(`${webUrl}${path}`, { waitUntil: 'domcontentloaded' });
      expect(response?.ok(), path).toBeTruthy();
      await expect(page.locator('#main-content')).toBeVisible();
    }
  });

  test('contacts page shows seller UNP and not fake trade register', async ({ page }) => {
    await page.goto(`${webUrl}/kontakty`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('591673107').first()).toBeVisible();
    await expect(page.getByText(/Олизар/i).first()).toBeVisible();
    await expect(page.getByText(/Каменчаны/i).first()).toBeVisible();
    // Bank should be behind details, not the hero focus — still present when expanded
    const bank = page.locator('details').filter({ hasText: /Банковск/i });
    if (await bank.count()) {
      await bank.first().locator('summary').click();
      await expect(page.getByText(/BY31POIS/i).first()).toBeVisible();
    }
  });

  test('delivery page states no online payment', async ({ page }) => {
    await page.goto(`${webUrl}/dostavka`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/онлайн-оплат/i).first()).toBeVisible();
    await expect(page.getByText(/Visa|Mastercard|ЕРИП/i)).toHaveCount(0);
  });

  test('checkout acknowledges legal docs and uses Оформить заказ', async ({ page }) => {
    await page.goto(`${webUrl}/checkout`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Оформить заказ' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /условиями заказа/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /политикой обработки/i }).first()).toBeVisible();
    await expect(page.getByText(/Оплата на сайте не производится/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Оплатить/i })).toHaveCount(0);
  });
});

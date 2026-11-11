/**
 * SF-08 regression: taxonomy landings must render (no RSC→client function leak),
 * holiday redirects from /povod keep query, filters stay on the taxonomy path.
 */
import { expect, test } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';

test.describe('taxonomy landings (SF-08)', () => {
  test('holiday pages render 200 with assortment heading', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop');
    test.setTimeout(90_000);

    for (const slug of ['8-marta', '14-fevralya', 'den-materi'] as const) {
      const res = await request.get(`${webUrl}/k-prazdniku/${slug}`);
      expect(res.status(), `/k-prazdniku/${slug}`).toBe(200);
      await page.goto(`${webUrl}/k-prazdniku/${slug}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#main-content')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // Reload keeps the landing alive (no client boundary crash).
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // Sort/filter query stays on the taxonomy path and still renders.
      const filtered = await request.get(`${webUrl}/k-prazdniku/${slug}?sort=price_asc`);
      expect(filtered.status(), `/k-prazdniku/${slug}?sort=price_asc`).toBe(200);
      await page.goto(`${webUrl}/k-prazdniku/${slug}?sort=price_asc`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page).toHaveURL(new RegExp(`/k-prazdniku/${slug}`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('legacy /povod/{holiday} redirects with query preserved', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop');
    const res = await request.get(`${webUrl}/povod/8-marta?flower=roza`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(308);
    const location = res.headers()['location'] ?? '';
    expect(location).toMatch(/\/k-prazdniku\/8-marta/);
    expect(location).toContain('flower=roza');

    const finalRes = await request.get(`${webUrl}/povod/den-materi?page=2`, { maxRedirects: 5 });
    expect(finalRes.status()).toBe(200);
    expect(finalRes.url()).toMatch(/\/k-prazdniku\/den-materi/);
  });

  test('occasion and recipient landings render', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop');
    test.setTimeout(90_000);

    const occasions = await request.get(`${webUrl}/api/v1/catalog/occasions`);
    const recipients = await request.get(`${webUrl}/api/v1/catalog/recipients`);
    expect(occasions.ok()).toBeTruthy();
    expect(recipients.ok()).toBeTruthy();
    const occasionSlug = ((await occasions.json()) as Array<{ slug: string }>)[0]?.slug;
    const recipientSlug = ((await recipients.json()) as Array<{ slug: string }>)[0]?.slug;
    expect(occasionSlug).toBeTruthy();
    expect(recipientSlug).toBeTruthy();

    for (const path of [`/povod/${occasionSlug}`, `/komu/${recipientSlug}`] as const) {
      const res = await request.get(`${webUrl}${path}`);
      expect(res.status(), path).toBe(200);
      await page.goto(`${webUrl}${path}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#main-content')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

/**
 * Phase 4 commerce E2E — cart → checkout → tracking → admin orders.
 * Uses system Chrome when PLAYWRIGHT_USE_SYSTEM_CHROME=true.
 */
import { expect, test, type Page } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

async function addFirstProductToCart(page: Page) {
  await page.goto(`${webUrl}/bukety/ameli`);
  const heading = page.getByRole('heading', { level: 1 });
  if (!(await heading.isVisible().catch(() => false))) {
    await page.goto(`${webUrl}/bukety`);
    const productLink = page.locator('main a[href^="/bukety/"]').first();
    const href = await productLink.getAttribute('href');
    test.skip(!href || href === '/bukety', 'No published products — seed required');
    await page.goto(`${webUrl}${href}`);
  }
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const variantOption = page.getByRole('option').nth(1);
  if (await variantOption.count()) {
    await variantOption.click();
  }

  await page.getByRole('button', { name: 'Добавить в корзину' }).click();
  await expect(page.getByRole('status')).toContainText(/Добавлено/i);
}

test.describe('commerce delivery journey', () => {
  test('home → product → cart → checkout → success → tracking', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop flow');
    test.setTimeout(120_000);
    await page.goto(webUrl);
    await expect(page.getByRole('heading', { name: 'БУКЕТ №1' }).first()).toBeVisible();

    await addFirstProductToCart(page);
    await page.goto(`${webUrl}/cart`);
    await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible();
    await page.getByRole('link', { name: 'Оформить заказ' }).click();

    await expect(page.getByRole('heading', { name: 'Оформление заказа' })).toBeVisible();
    await page.getByRole('button', { name: 'Доставка' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();

    await page.getByLabel('Имя', { exact: true }).first().fill('Павел Заказчик');
    await page.getByLabel('Телефон', { exact: true }).first().fill('+375291112233');
    await page.getByRole('textbox', { name: 'Адрес', exact: true }).fill('г. Гродно, ул. Советская 1');
    await page.getByRole('textbox', { name: 'Текст открытки' }).fill('С праздником!');
    await page.getByRole('textbox', { name: 'Комментарий к заказу' }).fill('Позвонить за 10 минут');

    await page.getByRole('button', { name: 'Отправить заказ' }).first().click();
    await expect(page).toHaveURL(/\/order\/success/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /принят/i })).toBeVisible();
    await expect(page.getByText(/Ваш заказ подтверждён/i)).toHaveCount(0);

    await page.getByRole('link', { name: 'Отслеживать заказ' }).click();
    await expect(page).toHaveURL(/\/order\/[^/]+/);
    await expect(page.getByText(/Статус:\s*Получен/i)).toBeVisible();
  });

  test('pickup flow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop flow');
    test.setTimeout(120_000);
    await addFirstProductToCart(page);
    await page.goto(`${webUrl}/checkout`);
    await page.getByRole('button', { name: 'Самовывоз' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();
    await page.getByLabel('Имя', { exact: true }).first().fill('Мария Самовывоз');
    await page.getByLabel('Телефон', { exact: true }).first().fill('+375293334455');
    await page.getByRole('button', { name: 'Отправить заказ' }).first().click();
    await expect(page).toHaveURL(/\/order\/success/, { timeout: 30_000 });
    await page.getByRole('link', { name: 'Отслеживать заказ' }).click();
    await expect(page.getByText(/Самовывоз/i)).toBeVisible();
  });
});

test.describe('commerce admin order flow', () => {
  test('admin sees order and advances statuses', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop admin');
    test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL/PASSWORD not set');
    test.setTimeout(180_000);

    await addFirstProductToCart(page);
    await page.goto(`${webUrl}/checkout`);
    await page.getByRole('button', { name: 'Доставка' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();
    await page.getByLabel('Имя', { exact: true }).first().fill('Админ Флоу');
    await page.getByLabel('Телефон', { exact: true }).first().fill('+375295556677');
    await page.getByRole('textbox', { name: 'Адрес', exact: true }).fill('г. Гродно, ул. Ожешко 10');
    await page.getByRole('button', { name: 'Отправить заказ' }).first().click();
    await expect(page).toHaveURL(/\/order\/success/, { timeout: 30_000 });
    const orderText = await page.locator('h1').innerText();
    const orderNumber = orderText.match(/№([0-9-]+)/)?.[1];
    expect(orderNumber).toBeTruthy();

    await page.goto(`${webUrl}/admin/login`);
    await page.getByLabel('Email').fill(adminEmail!);
    await page.getByLabel('Password').fill(adminPassword!);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL((url) => /\/admin\/?$/.test(url.pathname) || /\/admin\/(?!login)/.test(url.pathname), {
      timeout: 20_000,
    });
    await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible({ timeout: 15_000 });

    await page.goto(`${webUrl}/admin/orders?date=all&q=${encodeURIComponent(orderNumber!)}`);
    await expect(page.getByRole('heading', { name: 'Заказы' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Все' }).click();
    await expect(page.getByRole('link', { name: orderNumber! }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('link', { name: orderNumber! }).first().click();
    await expect(page.getByRole('heading', { name: new RegExp(orderNumber!) })).toBeVisible();

    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page.getByText(/Подтверждён/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Начать сборку' }).click();
    await expect(page.getByText(/Собирается/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Готов' }).click();
    await expect(page.getByText(/^Готов$/i).or(page.getByText(/· Готов/i)).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Передать в доставку' }).click();
    await expect(page.getByText(/В доставке/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Завершить' }).click();
    await expect(page.getByText(/Выполнен/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('commerce mobile checkout', () => {
  test('390px product → cart → checkout submit', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium', 'Mobile project');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await addFirstProductToCart(page);
    await page.goto(`${webUrl}/cart`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(overflow).toBe(false);
    await page.getByRole('link', { name: 'Оформить заказ' }).click();
    await page.getByRole('button', { name: 'Доставка' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();
    await page.getByLabel('Имя', { exact: true }).first().fill('Мобайл Клиент');
    await page.getByLabel('Телефон', { exact: true }).first().fill('+375297778899');
    await page.getByRole('textbox', { name: 'Адрес', exact: true }).fill('г. Гродно, ул. Мостовая 5');
    await page.getByRole('button', { name: 'Отправить заказ' }).first().click();
    await expect(page).toHaveURL(/\/order\/success/, { timeout: 30_000 });
  });
});

test.describe('commerce idempotent retry', () => {
  test('checkout submit reaches success (server idempotency covered in API integration)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop only');
    test.setTimeout(120_000);
    await addFirstProductToCart(page);
    await page.goto(`${webUrl}/checkout`);
    await page.getByRole('button', { name: 'Доставка' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();
    await page.getByLabel('Имя', { exact: true }).first().fill('Двойной Клик');
    await page.getByLabel('Телефон', { exact: true }).first().fill('+375291234567');
    await page.getByRole('textbox', { name: 'Адрес', exact: true }).fill('г. Гродно, ул. Дубко 3');

    const responses: number[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/api/v1/orders') && res.request().method() === 'POST') {
        responses.push(res.status());
      }
    });

    const submit = page.getByRole('button', { name: 'Отправить заказ' }).locator('visible=true').first();
    await expect(submit).toBeEnabled({ timeout: 45_000 });
    await submit.click();
    await expect(page).toHaveURL(/\/order\/success/, { timeout: 30_000 });
    expect(responses.length).toBeGreaterThanOrEqual(1);
    expect(responses.every((s) => s === 201 || s === 200)).toBe(true);
  });
});

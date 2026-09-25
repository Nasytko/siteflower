/**
 * Phase 4.3 commerce E2E — cart → checkout → tracking → admin orders.
 * Requires seeded catalog (`pnpm seed:dev-catalog`) with stable slug `ameli`.
 * Uses system Chrome when PLAYWRIGHT_USE_SYSTEM_CHROME=true.
 */
import { expect, test, type Page } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:3000';
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

/** Deterministic commerce fixture from `seed-dev-catalog`. */
const FIXTURE_PRODUCT = {
  slug: 'ameli',
  name: 'Амели',
  path: '/bukety/ameli',
} as const;

async function resetBrowserCommerceState(page: Page) {
  await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* private mode */
    }
  });
}

async function addFixtureProductToCart(page: Page) {
  await page.goto(`${webUrl}${FIXTURE_PRODUCT.path}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: FIXTURE_PRODUCT.name })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/BYN/i).first()).toBeVisible();

  // Wait until purchase panel client handlers are attached (avoids pre-hydration no-op clicks).
  await expect(page.locator('[data-purchase-ready="true"]')).toBeVisible({ timeout: 15_000 });

  const variantOption = page.getByRole('listbox', { name: 'Варианты букета' }).getByRole('option').nth(1);
  if ((await variantOption.count()) > 0) {
    await variantOption.click();
  }

  const addButton = page.getByTestId('add-to-cart');
  await expect(addButton).toBeEnabled({ timeout: 10_000 });
  await addButton.click();
  await expect(page.getByTestId('add-to-cart-status')).toContainText(/Добавлено/i, {
    timeout: 10_000,
  });
}

test.describe('commerce add-to-cart', () => {
  test('known product adds to cart with correct line', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop flow');
    test.setTimeout(60_000);
    await resetBrowserCommerceState(page);
    await addFixtureProductToCart(page);

    await page.goto(`${webUrl}/cart`);
    await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(FIXTURE_PRODUCT.name, 'i') }).first()).toBeVisible();
    await expect(page.getByText(/BYN/i).first()).toBeVisible();
    await expect(page.locator('input[type="number"]').first()).toHaveValue('1');
  });
});

test.describe('commerce delivery journey', () => {
  test('home → product → cart → checkout → success → tracking', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop flow');
    test.setTimeout(120_000);
    await resetBrowserCommerceState(page);

    await page.goto(webUrl);
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.getByText(/БУКЕТ\s*№?\s*1/i).first()).toBeVisible();

    await addFixtureProductToCart(page);
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

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const failedRequests: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 400 && /\/api\/v1\//.test(res.url())) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    // Attach listeners before checkout interactions that hit media/_next/image
    await page.getByRole('button', { name: 'Отправить заказ' }).first().click();
    await expect(page).toHaveURL(/\/order\/success/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /принят/i })).toBeVisible();
    await expect(page.getByText(/Ваш заказ подтверждён/i)).toHaveCount(0);

    await page.getByRole('link', { name: 'Отслеживать заказ' }).click();
    await expect(page).toHaveURL(/\/order\/[^/]+/);
    await expect(page.getByText(/Статус:\s*Получен/i)).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
    expect(failedRequests, `failed API: ${failedRequests.join(' | ')}`).toEqual([]);
  });

  test('pickup flow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop flow');
    test.setTimeout(120_000);
    await resetBrowserCommerceState(page);
    await addFixtureProductToCart(page);
    await page.goto(`${webUrl}/checkout`);
    await page.getByRole('button', { name: 'Самовывоз' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();
    await page.getByLabel('Имя', { exact: true }).first().fill('Мария Самовывоз');
    await page.getByLabel('Телефон', { exact: true }).first().fill('+375293334455');
    await expect(page.getByRole('textbox', { name: 'Адрес', exact: true })).toHaveCount(0);
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

    await resetBrowserCommerceState(page);
    await addFixtureProductToCart(page);
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
    await page.waitForURL(
      (url) => /\/admin\/?$/.test(url.pathname) || /\/admin\/(?!login)/.test(url.pathname),
      { timeout: 20_000 },
    );
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
    // Runs on mobile-chrome project (Pixel 5). Skip desktop chromium duplicate.
    test.skip(testInfo.project.name === 'chromium', 'Mobile project');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await resetBrowserCommerceState(page);
    await addFixtureProductToCart(page);
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
  test('checkout submit reaches success; idempotency key cleared after success', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop only');
    test.setTimeout(120_000);
    await resetBrowserCommerceState(page);
    await addFixtureProductToCart(page);
    await page.goto(`${webUrl}/checkout`);
    await expect(page.getByRole('heading', { name: 'Оформление заказа' })).toBeVisible();
    // Key is written in CheckoutForm useEffect after hydration — wait for it.
    await expect
      .poll(
        () => page.evaluate(() => sessionStorage.getItem('bouquet-one:checkout-idempotency')),
        { timeout: 10_000 },
      )
      .toBeTruthy();
    const keyBefore = await page.evaluate(() =>
      sessionStorage.getItem('bouquet-one:checkout-idempotency'),
    );

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

    const keyAfter = await page.evaluate(() =>
      sessionStorage.getItem('bouquet-one:checkout-idempotency'),
    );
    expect(keyAfter).toBeNull();
  });
});

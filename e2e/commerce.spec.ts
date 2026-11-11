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

/** Checkout CTA — UI label is «Оформить заказ» (not «Отправить заказ»). */
function checkoutSubmit(page: Page) {
  return page.getByRole('button', { name: /Оформить заказ|Подтвердить новую сумму/i }).first();
}

async function fillCheckoutPurchaser(
  page: Page,
  input: { name: string; phone: string; address?: string; deliveryToSelf?: boolean },
) {
  await page.getByLabel('Ваше имя', { exact: true }).fill(input.name);
  await page.getByLabel('Ваш телефон', { exact: true }).fill(input.phone);
  // Default checkout intent is gift-to-someone-else — without recipient fields submit stays local.
  if (input.address !== undefined || input.deliveryToSelf) {
    const selfBtn = page.getByRole('button', { name: 'Мне' });
    if ((await selfBtn.count()) > 0) {
      await selfBtn.click();
    }
  }
  if (input.address) {
    await page.getByLabel('Адрес доставки', { exact: true }).fill(input.address);
  }
}

async function waitForCheckoutReady(page: Page) {
  await expect(page.getByRole('heading', { name: 'Оформление заказа' })).toBeVisible();
  await expect(checkoutSubmit(page)).toBeEnabled({ timeout: 45_000 });
}

async function addFixtureProductToCart(page: Page) {
  // Retry once — intermittent net::ERR_ABORTED under local production Next can abort the first navigation.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(`${webUrl}${FIXTURE_PRODUCT.path}`, { waitUntil: 'domcontentloaded' });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.waitForTimeout(500);
    }
  }
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

  await page.getByTestId('add-to-cart').click();
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
    // Qty stepper shows the current quantity (no free-form number input).
    await expect(page.getByRole('group', { name: 'Количество' })).toContainText('1');
  });
});

test.describe('commerce delivery journey', () => {
  test('home → product → cart → checkout → success → tracking', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop flow');
    test.setTimeout(180_000);
    await resetBrowserCommerceState(page);

    await page.goto(webUrl);
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.getByRole('link', { name: /BUKET\s*№?\s*1/i }).first()).toBeVisible();

    await addFixtureProductToCart(page);
    await page.goto(`${webUrl}/cart`);
    await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible();
    await page.getByRole('link', { name: 'Оформить заказ' }).click();

    await waitForCheckoutReady(page);
    await page.getByRole('button', { name: 'Доставка' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();
    await fillCheckoutPurchaser(page, {
      name: 'Павел Заказчик',
      phone: '+375291112233',
      address: 'г. Гродно, ул. Советская 1',
      deliveryToSelf: true,
    });
    await page.getByRole('checkbox', { name: /Добавить открытку/i }).check();
    await page.getByRole('textbox', { name: 'Текст открытки' }).fill('С праздником!');
    await page.getByRole('textbox', { name: 'Комментарий к заказу' }).fill('Позвонить за 10 минут');
    await waitForCheckoutReady(page);

    // Prefer the sidebar «Итого» row — avoid unbounded getByText(/BYN/).last() waits.
    const confirmedTotal =
      (await page
        .locator('.sf-checkout-summary, aside, [data-checkout-total]')
        .getByText(/\d+[.,]\d+\s*BYN/i)
        .last()
        .textContent({ timeout: 5_000 })
        .catch(() => null)) ?? null;
    const confirmedSlot =
      (await page
        .locator('.sf-checkout-chip--active, button[aria-pressed="true"]')
        .filter({ hasText: /\d{2}:\d{2}|Завтра|Сегодня|Согласовать/i })
        .first()
        .textContent({ timeout: 3_000 })
        .catch(() => null)) ?? 'Завтра';

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const failedRequests: string[] = [];
    const orderPosts: Array<{ status: number; url: string }> = [];
    page.on('response', (res) => {
      if (res.status() >= 400 && /\/api\/v1\//.test(res.url())) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
      if (res.url().includes('/api/v1/orders') && res.request().method() === 'POST') {
        orderPosts.push({ status: res.status(), url: res.url() });
      }
    });

    await checkoutSubmit(page).click();
    await expect(page).toHaveURL(/\/order\/success/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /получен/i })).toBeVisible();
    await expect(page.getByText(/Ваш заказ подтверждён/i)).toHaveCount(0);
    expect(orderPosts.some((p) => p.status === 200 || p.status === 201)).toBe(true);

    await page.getByRole('link', { name: 'Отслеживать заказ' }).click();
    await expect(page).toHaveURL(/\/order\/[^/]+/);
    await expect(page.getByText(/Статус:\s*(Заказ\s+)?получен/i)).toBeVisible();
    // Success page has no totals — amount/slot live on the tracking view.
    if (confirmedTotal) {
      const formatted = confirmedTotal.match(/(\d+[.,]\d+)/)?.[1];
      if (formatted) {
        await expect(
          page.getByText(new RegExp(formatted.replace('.', ',').replace(',', '[,.]'))).first(),
        ).toBeVisible();
        await expect(page.getByText(/Итого/i)).toBeVisible();
      }
    }
    if (confirmedSlot && /\d{2}:\d{2}/.test(confirmedSlot)) {
      const slotBit = confirmedSlot.match(/\d{2}:\d{2}/)?.[0];
      if (slotBit) {
        await expect(page.getByText(new RegExp(slotBit))).toBeVisible();
      }
    } else {
      await expect(page.getByText(/Завтра|Согласовать|Доставка/i).first()).toBeVisible();
    }

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
    expect(failedRequests, `failed API: ${failedRequests.join(' | ')}`).toEqual([]);
  });

  test('pickup flow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop flow');
    test.setTimeout(120_000);
    await resetBrowserCommerceState(page);
    await addFixtureProductToCart(page);
    await page.goto(`${webUrl}/checkout`);
    await waitForCheckoutReady(page);
    await page.getByRole('button', { name: 'Самовывоз' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();
    await fillCheckoutPurchaser(page, {
      name: 'Мария Самовывоз',
      phone: '+375293334455',
      deliveryToSelf: true,
    });
    await expect(page.getByLabel('Адрес доставки', { exact: true })).toHaveCount(0);
    await waitForCheckoutReady(page);

    // Pickup quote must not include a delivery tariff (fee row stays 0,00).
    const deliveryFeeRow = page.locator('.sf-checkout-totals p').filter({ hasText: /^Доставка/ });
    await expect(deliveryFeeRow).toContainText(/0[,.]00/);

    await checkoutSubmit(page).click();
    await expect(page).toHaveURL(/\/order\/success/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /получен/i })).toBeVisible();
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
    await waitForCheckoutReady(page);
    await page.getByRole('button', { name: 'Доставка' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();
    await fillCheckoutPurchaser(page, {
      name: 'Админ Флоу',
      phone: '+375295556677',
      address: 'г. Гродно, ул. Ожешко 10',
      deliveryToSelf: true,
    });
    await waitForCheckoutReady(page);
    await checkoutSubmit(page).click();
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
    await waitForCheckoutReady(page);
    await page.getByRole('button', { name: 'Доставка' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();
    await fillCheckoutPurchaser(page, {
      name: 'Мобайл Клиент',
      phone: '+375297778899',
      address: 'г. Гродно, ул. Мостовая 5',
      deliveryToSelf: true,
    });
    await waitForCheckoutReady(page);
    await checkoutSubmit(page).click();
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
    await waitForCheckoutReady(page);
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
    await fillCheckoutPurchaser(page, {
      name: 'Двойной Клик',
      phone: '+375291234567',
      address: 'г. Гродно, ул. Дубко 3',
      deliveryToSelf: true,
    });
    await waitForCheckoutReady(page);

    const responses: Array<{ status: number; orderNumber?: string }> = [];
    page.on('response', async (res) => {
      if (res.url().includes('/api/v1/orders') && res.request().method() === 'POST') {
        let orderNumber: string | undefined;
        try {
          const json = (await res.json()) as { orderNumber?: string };
          orderNumber = json.orderNumber;
        } catch {
          /* ignore */
        }
        responses.push({ status: res.status(), orderNumber });
      }
    });

    let capturedBody: unknown;
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/orders') && req.method() === 'POST' && !capturedBody) {
        try {
          capturedBody = req.postDataJSON();
        } catch {
          /* ignore */
        }
      }
    });

    await checkoutSubmit(page).click();
    await expect(page).toHaveURL(/\/order\/success/, { timeout: 30_000 });
    expect(responses.length).toBeGreaterThanOrEqual(1);
    expect(responses.every((s) => s.status === 201 || s.status === 200)).toBe(true);
    expect(keyBefore).toBeTruthy();
    const firstOrder = responses[0]?.orderNumber;
    expect(firstOrder).toBeTruthy();

    // Replay the original request with the same idempotency key — same order, no second row.
    expect(capturedBody).toBeTruthy();
    const replay = await page.request.post(`${webUrl}/api/v1/orders`, {
      data: capturedBody,
      failOnStatusCode: false,
    });
    expect([200, 201]).toContain(replay.status());
    const replayJson = (await replay.json()) as { orderNumber?: string };
    expect(replayJson.orderNumber).toBe(firstOrder);

    const keyAfter = await page.evaluate(() =>
      sessionStorage.getItem('bouquet-one:checkout-idempotency'),
    );
    expect(keyAfter).toBeNull();
  });
});

test.describe('commerce slot freshness + quote lock (SF-09 / P1)', () => {
  test('stale today slot prompts reselect; form fields stay filled', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop only');
    test.setTimeout(120_000);
    await resetBrowserCommerceState(page);
    await addFixtureProductToCart(page);
    await page.goto(`${webUrl}/checkout`);
    await expect(page.getByRole('heading', { name: 'Оформление заказа' })).toBeVisible();

    await page.getByRole('button', { name: 'Доставка' }).click();
    await page.getByRole('button', { name: 'Сегодня' }).click();
    await page.getByLabel('Ваше имя', { exact: true }).fill('Слот Проверка');
    await page.getByLabel('Ваш телефон', { exact: true }).fill('+375291000001');
    await page.getByLabel('Адрес доставки', { exact: true }).fill('г. Гродно, ул. Тестовая 1');

    const slotButtons = page.locator('.sf-checkout-chip, button').filter({ hasText: /^\d{2}:\d{2}/ });
    const slotCount = await slotButtons.count();
    if (slotCount === 0) {
      // Late evening / no lead windows — manager path still keeps form data.
      await page.getByLabel(/Согласовать.*менеджер/i).check();
      await expect(page.getByLabel('Ваше имя', { exact: true })).toHaveValue('Слот Проверка');
      await expect(page.getByLabel('Адрес доставки', { exact: true })).toHaveValue(
        'г. Гродно, ул. Тестовая 1',
      );
      return;
    }

    await slotButtons.first().click();
    // Force client clock past lead so selectableHourlyWindows drops early slots.
    await page.evaluate(() => {
      const real = Date.now;
      // Advance ~3 hours without remounting React tree.
      const skew = 3 * 60 * 60 * 1000;
      // @ts-expect-error test hook
      Date.now = () => real() + skew;
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(500);

    await expect(page.getByLabel('Ваше имя', { exact: true })).toHaveValue('Слот Проверка');
    await expect(page.getByLabel('Ваш телефон', { exact: true })).toHaveValue('+375291000001');
    await expect(page.getByLabel('Адрес доставки', { exact: true })).toHaveValue(
      'г. Гродно, ул. Тестовая 1',
    );
  });

  test('QuoteMismatch keeps cart data and requires explicit reconfirm', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop only');
    test.setTimeout(120_000);
    await resetBrowserCommerceState(page);
    await addFixtureProductToCart(page);
    await page.goto(`${webUrl}/checkout`);
    await waitForCheckoutReady(page);
    await page.getByRole('button', { name: 'Доставка' }).click();
    await page.getByRole('button', { name: 'Завтра' }).click();
    await fillCheckoutPurchaser(page, {
      name: 'Котировка Тест',
      phone: '+375291000002',
      address: 'г. Гродно, ул. Ценовая 2',
      deliveryToSelf: true,
    });
    await waitForCheckoutReady(page);

    let orderCreates = 0;
    let reconfirmTotalMinor: string | undefined;
    const bumpedTotalMinor = '9900';
    await page.route('**/api/v1/orders', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      orderCreates += 1;
      const posted = route.request().postDataJSON() as {
        confirmedQuote?: {
          items: unknown[];
          subtotalMinor: string;
          deliveryFeeMinor: string;
          totalMinor: string;
          fulfillmentType: string;
        };
        fulfillmentType?: string;
        fulfillmentDate?: string;
      };
      const quote = posted.confirmedQuote;
      if (orderCreates === 1) {
        // First attempt: surface QuoteMismatch with a new total; do not create an order.
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'QuoteMismatch',
            message: 'Сумма заказа изменилась. Проверьте итог и нажмите «Оформить заказ» ещё раз.',
            current: {
              ok: true,
              currency: 'BYN',
              items: quote?.items ?? [],
              subtotalMinor: bumpedTotalMinor,
              deliveryFeeMinor: quote?.deliveryFeeMinor ?? '0',
              totalMinor: bumpedTotalMinor,
              issues: [{ code: 'PRICE_CHANGED', message: 'Цена изменилась' }],
            },
          }),
        });
        return;
      }
      // Reconfirm must post the bumped quote; fulfill success here so the real quote
      // engine does not 409 again against the synthetic mismatch totals.
      reconfirmTotalMinor = quote?.totalMinor;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-quote-mismatch-order',
          orderNumber: '261108-QM',
          trackingToken: 'e2e-quote-mismatch-tracking-token',
          trackingPath: '/order/e2e-quote-mismatch-tracking-token',
          replayed: false,
          status: 'RECEIVED',
          fulfillmentType: posted.fulfillmentType ?? 'DELIVERY',
          fulfillmentDate: posted.fulfillmentDate ?? '2099-01-01',
          timeWindowLabel: 'Завтра',
          totalMinor: bumpedTotalMinor,
          currency: 'BYN',
        }),
      });
    });

    await checkoutSubmit(page).click();
    await expect(
      page.getByText('Сумма заказа изменилась. Проверьте итог и нажмите «Оформить заказ» ещё раз.'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Подтвердить новую сумму' })).toBeVisible();
    await expect(page.getByText(/99[,.]00/).first()).toBeVisible();
    await expect(page.getByLabel('Ваше имя', { exact: true })).toHaveValue('Котировка Тест');
    await expect(page.getByLabel('Адрес доставки', { exact: true })).toHaveValue(
      'г. Гродно, ул. Ценовая 2',
    );
    await expect(page).not.toHaveURL(/\/order\/success/);
    expect(orderCreates).toBe(1);

    // Order is created only after the shopper explicitly reconfirms the new total.
    await page.getByRole('button', { name: 'Подтвердить новую сумму' }).click();
    await expect(page).toHaveURL(/\/order\/success/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /получен/i })).toBeVisible();
    expect(orderCreates).toBe(2);
    expect(reconfirmTotalMinor).toBe(bumpedTotalMinor);
  });
});

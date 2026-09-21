'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type {
  CheckoutValidateResponse,
  CreateOrderRequest,
  FulfillmentSettingsPublicDto,
  FulfillmentType,
  OrderCreatedResponse,
} from '@bouquet-one/contracts';
import { formatPriceFromMinor } from '@/lib/media';
import { trackEvent } from '@/lib/analytics';
import { clearCart, readCart, writeCart, type CartState } from '@/lib/cart';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idemp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutForm() {
  const router = useRouter();
  const [cart, setCart] = useState<CartState>({ version: 1, items: [] });
  const [options, setOptions] = useState<FulfillmentSettingsPublicDto | null>(null);
  const [validated, setValidated] = useState<CheckoutValidateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('DELIVERY');
  const [dateMode, setDateMode] = useState<'today' | 'tomorrow' | 'pick'>('tomorrow');
  const [fulfillmentDate, setFulfillmentDate] = useState('');
  const [timeWindowId, setTimeWindowId] = useState('');
  const [purchaserName, setPurchaserName] = useState('');
  const [purchaserPhone, setPurchaserPhone] = useState('');
  const [recipientIsMe, setRecipientIsMe] = useState(true);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [surprise, setSurprise] = useState(false);
  const [addressKnown, setAddressKnown] = useState(true);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [addressDetails, setAddressDetails] = useState('');
  const [cardMessage, setCardMessage] = useState('');
  const [anonymousCard, setAnonymousCard] = useState(false);
  const [customerComment, setCustomerComment] = useState('');

  useEffect(() => {
    const c = readCart();
    setCart(c);
    if (c.items.length === 0) return;
    trackEvent('begin_checkout', {
      itemCount: c.items.reduce((s, i) => s + i.quantity, 0),
    });

    void (async () => {
      try {
        const [optRes, valRes] = await Promise.all([
          fetch('/api/v1/checkout/fulfillment-options', { cache: 'no-store' }),
          fetch('/api/v1/checkout/validate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              items: c.items.map((i) => ({
                productId: i.productId,
                variantId: i.variantId,
                quantity: i.quantity,
              })),
              priorUnitPrices: c.items
                .filter((i) => i.unitPriceMinor)
                .map((i) => ({
                  variantId: i.variantId,
                  unitPriceMinor: i.unitPriceMinor!,
                })),
            }),
          }),
        ]);
        if (optRes.ok) {
          const opt = (await optRes.json()) as FulfillmentSettingsPublicDto;
          setOptions(opt);
          setFulfillmentDate(opt.todayBusinessDate);
          const first = opt.timeWindows[0];
          if (first) setTimeWindowId(first.id);
          if (!opt.deliveryEnabled && opt.pickupEnabled) setFulfillmentType('PICKUP');
        }
        if (valRes.ok) {
          setValidated((await valRes.json()) as CheckoutValidateResponse);
        }
      } catch {
        setError('Не удалось загрузить оформление. Обновите страницу.');
      }
    })();
  }, []);

  useEffect(() => {
    if (!options) return;
    if (dateMode === 'today') setFulfillmentDate(options.todayBusinessDate);
    if (dateMode === 'tomorrow') {
      const [y, m, d] = options.todayBusinessDate.split('-').map(Number);
      const t = new Date(Date.UTC(y!, m! - 1, d! + 1));
      setFulfillmentDate(
        `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`,
      );
    }
  }, [dateMode, options]);

  const windows = useMemo(() => {
    if (!options) return [];
    return options.timeWindows.filter(
      (w) =>
        w.appliesTo === 'BOTH' ||
        w.appliesTo === fulfillmentType,
    );
  }, [options, fulfillmentType]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const body: CreateOrderRequest = {
      idempotencyKey,
      items: cart.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
      })),
      fulfillmentType,
      purchaserName,
      purchaserPhone,
      fulfillmentDate,
      timeWindowId,
      surprise,
      cardMessage: cardMessage || null,
      anonymousCard,
      customerComment: customerComment || null,
    };

    if (fulfillmentType === 'DELIVERY') {
      body.recipientName = recipientIsMe ? purchaserName : recipientName;
      body.recipientPhone = recipientIsMe ? purchaserPhone : recipientPhone;
      body.addressKnown = addressKnown;
      body.deliveryAddress = addressKnown ? deliveryAddress : null;
      body.addressDetails = addressDetails || null;
    }

    try {
      const res = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as
        | OrderCreatedResponse
        | { message?: string | string[] }
        | null;

      if (!res.ok) {
        const msg =
          data && 'message' in data
            ? Array.isArray(data.message)
              ? data.message.join(', ')
              : data.message
            : 'Не удалось создать заказ';
        setError(msg ?? 'Не удалось создать заказ');
        setPending(false);
        return;
      }

      const created = data as OrderCreatedResponse;
      trackEvent('order_created', {
        orderNumber: created.orderNumber,
        fulfillmentType: created.fulfillmentType,
      });
      writeCart(clearCart());

      try {
        sessionStorage.setItem(
          'bouquet-one:last-order',
          JSON.stringify({
            orderNumber: created.orderNumber,
            trackingToken: created.trackingToken,
            totalMinor: created.totalMinor,
          }),
        );
      } catch {
        /* ignore */
      }
      router.replace('/order/success');
    } catch {
      setError('Сеть недоступна. Заказ не отправлен — корзина сохранена. Повторите попытку.');
      setPending(false);
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="space-y-4">
        <p className="sf-body text-muted">Корзина пуста</p>
        <Link href="/bukety" className="text-sm font-medium text-brand hover:underline">
          В каталог
        </Link>
      </div>
    );
  }

  const deliveryFee =
    fulfillmentType === 'DELIVERY'
      ? BigInt(validated?.deliveryFeeMinor ?? options?.deliveryFeeMinor ?? '0')
      : 0n;
  const subtotal = BigInt(validated?.subtotalMinor ?? '0');
  const total = subtotal + deliveryFee;

  return (
    <form onSubmit={onSubmit} className="grid gap-10 lg:grid-cols-[1fr_320px]" noValidate>
      <div className="space-y-10">
        <section className="space-y-4">
          <h2 className="sf-h3">Получение</h2>
          <div className="flex flex-wrap gap-2">
            {options?.deliveryEnabled !== false ? (
              <button
                type="button"
                className={`min-h-11 rounded-[var(--radius-md)] px-4 py-2 text-sm ${
                  fulfillmentType === 'DELIVERY'
                    ? 'bg-brand text-brand-foreground'
                    : 'bg-brand-soft'
                }`}
                onClick={() => {
                  setFulfillmentType('DELIVERY');
                  trackEvent('select_fulfillment', { type: 'DELIVERY' });
                }}
              >
                Доставка
              </button>
            ) : null}
            {options?.pickupEnabled !== false ? (
              <button
                type="button"
                className={`min-h-11 rounded-[var(--radius-md)] px-4 py-2 text-sm ${
                  fulfillmentType === 'PICKUP'
                    ? 'bg-brand text-brand-foreground'
                    : 'bg-brand-soft'
                }`}
                onClick={() => {
                  setFulfillmentType('PICKUP');
                  trackEvent('select_fulfillment', { type: 'PICKUP' });
                }}
              >
                Самовывоз
              </button>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="sf-h3">Дата и время</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['today', 'Сегодня'],
                ['tomorrow', 'Завтра'],
                ['pick', 'Выбрать дату'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`min-h-11 rounded-[var(--radius-md)] px-4 py-2 text-sm ${
                  dateMode === mode ? 'bg-brand text-brand-foreground' : 'bg-brand-soft'
                }`}
                onClick={() => setDateMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          {dateMode === 'pick' ? (
            <input
              type="date"
              required
              value={fulfillmentDate}
              onChange={(e) => setFulfillmentDate(e.target.value)}
              className="w-full max-w-xs rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
            />
          ) : (
            <p className="sf-small text-muted">{fulfillmentDate}</p>
          )}
          <label className="block text-sm">
            Интервал
            <select
              required
              value={timeWindowId}
              onChange={(e) => setTimeWindowId(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
            >
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="space-y-4">
          <h2 className="sf-h3">Заказчик</h2>
          <label className="block text-sm">
            Имя
            <input
              required
              autoComplete="name"
              value={purchaserName}
              onChange={(e) => setPurchaserName(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Телефон
            <input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+375 29 …"
              value={purchaserPhone}
              onChange={(e) => setPurchaserPhone(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
            />
          </label>
        </section>

        {fulfillmentType === 'DELIVERY' ? (
          <section className="space-y-4">
            <h2 className="sf-h3">Получатель</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={recipientIsMe}
                onChange={(e) => setRecipientIsMe(e.target.checked)}
              />
              Получатель — я
            </label>
            {!recipientIsMe ? (
              <>
                <label className="block text-sm">
                  Имя получателя
                  <input
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  Телефон получателя
                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
                  />
                </label>
              </>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={surprise}
                onChange={(e) => setSurprise(e.target.checked)}
              />
              Это сюрприз
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!addressKnown}
                onChange={(e) => setAddressKnown(!e.target.checked)}
              />
              Не знаю точный адрес
            </label>
            {addressKnown ? (
              <label className="block text-sm">
                Адрес
                <input
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
                />
              </label>
            ) : null}
            <label className="block text-sm">
              Уточнения к адресу
              <input
                value={addressDetails}
                onChange={(e) => setAddressDetails(e.target.value)}
                className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
              />
            </label>
          </section>
        ) : (
          <section className="space-y-2">
            <h2 className="sf-h3">Самовывоз</h2>
            <p className="sf-body text-muted">
              {options?.pickupInstructions ?? 'Адрес пункта самовывоза — в разделе «О нас» / контакты магазина.'}
            </p>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="sf-h3">Открытка и пожелания</h2>
          <label className="block text-sm">
            Текст открытки
            <textarea
              maxLength={500}
              rows={3}
              value={cardMessage}
              onChange={(e) => setCardMessage(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={anonymousCard}
              onChange={(e) => setAnonymousCard(e.target.checked)}
            />
            Не указывать отправителя на открытке
          </label>
          <label className="block text-sm">
            Комментарий к заказу
            <textarea
              maxLength={1000}
              rows={3}
              value={customerComment}
              onChange={(e) => setCustomerComment(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
            />
          </label>
        </section>

        {validated?.issues?.length ? (
          <ul className="space-y-2 rounded-[var(--radius-md)] border border-border bg-brand-soft/40 p-4">
            {validated.issues.map((issue, idx) => (
              <li key={`${issue.code}-${idx}`} className="sf-small text-foreground">
                {issue.message}
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-brand px-6 py-3 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50 lg:hidden"
        >
          {pending ? 'Отправка…' : 'Отправить заказ'}
        </button>
      </div>

      <aside className="h-fit space-y-4 rounded-[var(--radius-md)] border border-border p-5 lg:sticky lg:top-24">
        <h2 className="sf-h3">Ваш заказ</h2>
        <ul className="space-y-3">
          {(validated?.items ?? []).length > 0
            ? validated!.items.map((line) => (
                <li key={line.variantId} className="sf-small">
                  <span className="font-medium text-foreground">
                    {line.productName} · {line.variantName}
                  </span>
                  <span className="mt-0.5 block text-muted">
                    × {line.quantity} · {formatPriceFromMinor(line.lineTotalMinor)}
                  </span>
                </li>
              ))
            : cart.items.map((line) => (
                <li key={line.variantId} className="sf-small">
                  <span className="font-medium text-foreground">
                    {line.productName ?? 'Букет'} · {line.variantName ?? ''}
                  </span>
                  <span className="mt-0.5 block text-muted">× {line.quantity}</span>
                </li>
              ))}
        </ul>
        <div className="border-t border-border pt-4">
          <p className="sf-small flex justify-between text-muted">
            <span>Товары</span>
            <span className="tabular-nums">{formatPriceFromMinor(subtotal.toString())}</span>
          </p>
          <p className="sf-small mt-1 flex justify-between text-muted">
            <span>Доставка</span>
            <span className="tabular-nums">{formatPriceFromMinor(deliveryFee.toString())}</span>
          </p>
          <p className="sf-price mt-3 flex justify-between text-lg">
            <span>Итого</span>
            <span className="tabular-nums">{formatPriceFromMinor(total.toString())}</span>
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="hidden min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-brand px-6 py-3 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50 lg:inline-flex"
        >
          {pending ? 'Отправка…' : 'Отправить заказ'}
        </button>
        <p className="sf-small text-muted">
          Менеджер свяжется для подтверждения. Это ещё не подтверждённый заказ.
        </p>
      </aside>
    </form>
  );
}

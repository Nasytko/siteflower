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
import { MANAGER_TIME_WINDOW_ID } from '@bouquet-one/contracts';
import { formatPriceFromMinor } from '@/lib/media';
import { trackEvent } from '@/lib/analytics';
import {
  clearCart,
  readCardDraft,
  readCart,
  writeCardDraft,
  writeCart,
  type CartState,
} from '@/lib/cart';
import { selectableHourlyWindows } from '@/lib/fulfillment-slots';

const IDEMPOTENCY_STORAGE_KEY = 'bouquet-one:checkout-idempotency';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idemp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** One checkout submission intent — survives refresh; cleared after confirmed success. */
function readOrCreateIdempotencyKey(): string {
  try {
    const existing = sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
    if (existing && existing.length >= 8 && existing.length <= 128) {
      return existing;
    }
  } catch {
    /* private mode */
  }
  const key = newIdempotencyKey();
  try {
    sessionStorage.setItem(IDEMPOTENCY_STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
  return key;
}

function clearCheckoutIdempotencyKey(): void {
  try {
    sessionStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function CheckoutForm() {
  const router = useRouter();
  const [cart, setCart] = useState<CartState>({ version: 1, items: [] });
  const [options, setOptions] = useState<FulfillmentSettingsPublicDto | null>(null);
  const [validated, setValidated] = useState<CheckoutValidateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    setIdempotencyKey(readOrCreateIdempotencyKey());
  }, []);

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('DELIVERY');
  const [dateMode, setDateMode] = useState<'today' | 'tomorrow' | 'pick'>('tomorrow');
  const [fulfillmentDate, setFulfillmentDate] = useState('');
  const [timeWindowId, setTimeWindowId] = useState('');
  const [agreeWithManager, setAgreeWithManager] = useState(false);
  const [desiredTimeNote, setDesiredTimeNote] = useState('');
  const [purchaserName, setPurchaserName] = useState('');
  const [purchaserPhone, setPurchaserPhone] = useState('');
  const [recipientIsMe, setRecipientIsMe] = useState(true);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [surprise, setSurprise] = useState(false);
  const [addressKnown, setAddressKnown] = useState(true);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [addressDetails, setAddressDetails] = useState('');
  const [wantCard, setWantCard] = useState(false);
  const [cardMessage, setCardMessage] = useState('');
  const [anonymousCard, setAnonymousCard] = useState(false);
  const [customerComment, setCustomerComment] = useState('');

  useEffect(() => {
    const draft = readCardDraft();
    if (draft.trim()) {
      setWantCard(true);
      setCardMessage(draft);
    }
  }, []);

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
                ...(i.optionValueIds?.length ? { optionValueIds: i.optionValueIds } : {}),
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
          // Prefer tomorrow — more slots usually available than "today + 1h".
          const [y, m, d] = opt.todayBusinessDate.split('-').map(Number);
          const t = new Date(Date.UTC(y!, m! - 1, d! + 1));
          const tomorrow = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
          setFulfillmentDate(tomorrow);
          setDateMode('tomorrow');
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
    if (!options || !fulfillmentDate) return [];
    return selectableHourlyWindows({
      windows: options.timeWindows,
      fulfillmentDate,
      fulfillmentType,
      minLeadMinutes: options.minLeadTimeMinutes,
    });
  }, [options, fulfillmentType, fulfillmentDate]);

  useEffect(() => {
    if (agreeWithManager) {
      setTimeWindowId(MANAGER_TIME_WINDOW_ID);
      return;
    }
    if (windows.length === 0) {
      setTimeWindowId('');
      return;
    }
    if (!windows.some((w) => w.id === timeWindowId)) {
      setTimeWindowId(windows[0]!.id);
    }
  }, [agreeWithManager, windows, timeWindowId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    if (agreeWithManager) {
      if (!desiredTimeNote.trim()) {
        setError('Укажите желаемое время для согласования с менеджером');
        setPending(false);
        return;
      }
    } else if (!timeWindowId || windows.length === 0) {
      setError('Нет доступных интервалов на эту дату — выберите другой день или согласуйте время с менеджером');
      setPending(false);
      return;
    }

    const managerNote = agreeWithManager
      ? `Согласовать время с менеджером: ${desiredTimeNote.trim()}`
      : null;
    const mergedComment = [managerNote, customerComment.trim() || null].filter(Boolean).join('\n');

    const body: CreateOrderRequest = {
      idempotencyKey,
      items: cart.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        ...(i.optionValueIds?.length ? { optionValueIds: i.optionValueIds } : {}),
      })),
      fulfillmentType,
      purchaserName,
      purchaserPhone,
      fulfillmentDate,
      timeWindowId: agreeWithManager ? MANAGER_TIME_WINDOW_ID : timeWindowId,
      surprise,
      cardMessage: wantCard && cardMessage.trim() ? cardMessage.trim() : null,
      anonymousCard: wantCard ? anonymousCard : false,
      customerComment: mergedComment || null,
      paymentMethod: 'CASH_ON_DELIVERY',
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
      writeCardDraft('');
      clearCheckoutIdempotencyKey();

      try {
        sessionStorage.setItem(
          'bouquet-one:last-order',
          JSON.stringify({
            orderNumber: created.orderNumber,
            // Short-lived success page only — not long-term localStorage.
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
        <Link href="/catalog/bouquets" className="text-sm font-medium text-brand hover:underline">
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
                className={`min-h-11 rounded-full border px-4 py-2 text-sm transition ${
                  fulfillmentType === 'DELIVERY'
                    ? 'border-brand bg-brand text-brand-foreground'
                    : 'border-border-strong bg-surface hover:border-brand hover:text-brand'
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
                className={`min-h-11 rounded-full border px-4 py-2 text-sm transition ${
                  fulfillmentType === 'PICKUP'
                    ? 'border-brand bg-brand text-brand-foreground'
                    : 'border-border-strong bg-surface hover:border-brand hover:text-brand'
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
                className={`min-h-11 rounded-full border px-4 py-2 text-sm transition ${
                  dateMode === mode
                    ? 'border-brand bg-brand text-brand-foreground'
                    : 'border-border-strong bg-surface hover:border-brand hover:text-brand'
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
              className="w-full max-w-xs rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2"
            />
          ) : (
            <p className="sf-small text-muted">{fulfillmentDate}</p>
          )}

          {!agreeWithManager ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Время (каждый час, ближайшее — через час)</p>
              {windows.length === 0 ? (
                <p className="sf-small text-muted">
                  На эту дату свободных слотов нет. Выберите другой день или согласуйте время с
                  менеджером.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {windows.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={`min-h-11 rounded-full border px-3.5 py-2 text-sm tabular-nums transition ${
                        timeWindowId === w.id
                          ? 'border-brand bg-brand text-brand-foreground'
                          : 'border-border-strong bg-surface hover:border-brand hover:text-brand'
                      }`}
                      onClick={() => setTimeWindowId(w.id)}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <label className="block text-sm">
              Желаемое время
              <input
                required
                value={desiredTimeNote}
                onChange={(e) => setDesiredTimeNote(e.target.value)}
                placeholder="Например: сегодня к 23:00 или к 8:30"
                className="mt-1 w-full rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2"
              />
              <span className="mt-1 block sf-small text-muted">
                Менеджер подтвердит, получится ли доставить вне обычных часов 9:00–21:00.
              </span>
            </label>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-muted/40 px-3 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={agreeWithManager}
              onChange={(e) => setAgreeWithManager(e.target.checked)}
            />
            <span>
              <span className="font-medium">Согласовать уникальное время с менеджером</span>
              <span className="mt-0.5 block text-muted">
                Для доставки вне 9:00–21:00 или если нужен точный час, которого нет в списке.
              </span>
            </span>
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
              className="mt-1 w-full rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2"
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
              className="mt-1 w-full rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2"
            />
          </label>
        </section>

        {fulfillmentType === 'DELIVERY' ? (
          <section className="space-y-4">
            <h2 className="sf-h3">Получатель</h2>
            <div className="sf-pdp-intent" role="group" aria-label="Тип заказа">
              <button
                type="button"
                className={`sf-pdp-intent__btn ${recipientIsMe ? 'sf-pdp-intent__btn--active' : ''}`}
                aria-pressed={recipientIsMe}
                onClick={() => setRecipientIsMe(true)}
              >
                Себе
              </button>
              <button
                type="button"
                className={`sf-pdp-intent__btn ${!recipientIsMe ? 'sf-pdp-intent__btn--active' : ''}`}
                aria-pressed={!recipientIsMe}
                onClick={() => setRecipientIsMe(false)}
              >
                Подарок
              </button>
            </div>
            {!recipientIsMe ? (
              <>
                <label className="block text-sm">
                  Имя получателя
                  <input
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="mt-1 w-full rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2"
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
                    className="mt-1 w-full rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2"
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
                  className="mt-1 w-full rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2"
                />
              </label>
            ) : null}
            <label className="block text-sm">
              Уточнения к адресу
              <input
                value={addressDetails}
                onChange={(e) => setAddressDetails(e.target.value)}
                className="mt-1 w-full rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2"
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={wantCard}
              onChange={(e) => {
                setWantCard(e.target.checked);
                if (!e.target.checked) {
                  setCardMessage('');
                  setAnonymousCard(false);
                }
              }}
            />
            Добавить открытку
          </label>
          {wantCard ? (
            <>
              <label className="block text-sm">
                Текст открытки
                <textarea
                  maxLength={500}
                  rows={3}
                  value={cardMessage}
                  onChange={(e) => setCardMessage(e.target.value)}
                  className="mt-1 w-full rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2"
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
            </>
          ) : null}
          <label className="block text-sm">
            Комментарий к заказу
            <textarea
              maxLength={1000}
              rows={3}
              value={customerComment}
              onChange={(e) => setCustomerComment(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2"
            />
          </label>
        </section>

        {validated?.issues?.length ? (
          <ul className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-brand-soft/40 p-4">
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

        <p className="sf-small text-muted leading-relaxed">
          Оформляя заказ, вы подтверждаете, что ознакомились с{' '}
          <Link href="/oferta" className="underline underline-offset-2 hover:text-brand">
            условиями заказа
          </Link>
          ,{' '}
          <Link href="/dostavka" className="underline underline-offset-2 hover:text-brand">
            доставкой и оплатой
          </Link>
          ,{' '}
          <Link href="/vozvrat" className="underline underline-offset-2 hover:text-brand">
            возвратом и претензиями
          </Link>{' '}
          и{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-brand">
            политикой обработки персональных данных
          </Link>
          . Оплата на сайте не производится — менеджер сообщит доступные способы после проверки
          заказа.
        </p>

        <button
          type="submit"
          disabled={pending}
          className="sf-cta inline-flex min-h-12 w-full disabled:cursor-not-allowed disabled:opacity-50 lg:hidden"
        >
          {pending ? 'Отправка…' : 'Оформить заказ'}
        </button>
      </div>

      <aside className="sf-panel h-fit space-y-4 p-5 lg:sticky lg:top-24">
        <h2 className="sf-h3">Ваш заказ</h2>
        <ul className="space-y-3">
          {(validated?.items ?? []).length > 0
            ? validated!.items.map((line) => (
                <li
                  key={`${line.variantId}:${(line.optionsSnapshot ?? []).map((o) => o.valueId).join(',')}`}
                  className="sf-small"
                >
                  <span className="font-medium text-foreground">
                    {line.productName} · {line.variantName}
                  </span>
                  {line.optionsSnapshot && line.optionsSnapshot.length > 0 ? (
                    <span className="mt-0.5 block text-muted">
                      {line.optionsSnapshot.map((o) => o.valueName).join(', ')}
                    </span>
                  ) : null}
                  <span className="mt-0.5 block text-muted">
                    × {line.quantity} · {formatPriceFromMinor(line.lineTotalMinor)}
                  </span>
                </li>
              ))
            : cart.items.map((line) => (
                <li key={`${line.variantId}:${(line.optionValueIds ?? []).join(',')}`} className="sf-small">
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
          className="sf-cta hidden w-full disabled:cursor-not-allowed disabled:opacity-50 lg:inline-flex"
        >
          {pending ? 'Отправка…' : 'Оформить заказ'}
        </button>
        <p className="sf-small text-muted">
          После оформления заказ будет получен в обработку. Менеджер свяжется для подтверждения
          деталей. Это ещё не подтверждённый заказ.
        </p>
      </aside>
    </form>
  );
}

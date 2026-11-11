'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CheckoutValidateResponse,
  CreateOrderRequest,
  FulfillmentSettingsPublicDto,
  FulfillmentType,
  OrderConfirmedQuote,
  OrderCreatedResponse,
  OrderQuoteMismatchError,
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
import { isStemBouquetLine, stemCountLabel } from '@/lib/cart-labels';
import {
  isFulfillmentSlotRejectionMessage,
  isSelectedSlotStale,
  selectableHourlyWindows,
} from '@/lib/fulfillment-slots';

type QuoteStatus = 'loading' | 'ready' | 'stale' | 'error';

function buildConfirmedQuote(
  validated: CheckoutValidateResponse,
  fulfillmentType: FulfillmentType,
): OrderConfirmedQuote {
  const deliveryFeeMinor =
    fulfillmentType === 'DELIVERY' ? validated.deliveryFeeMinor : '0';
  const subtotalMinor = validated.subtotalMinor;
  const totalMinor = (BigInt(subtotalMinor) + BigInt(deliveryFeeMinor)).toString();
  return {
    fulfillmentType,
    items: validated.items.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      optionValueIds: line.optionsSnapshot?.map((o) => o.valueId),
      unitPriceMinor: line.unitPriceMinor,
      optionsTotalMinor: line.optionsTotalMinor,
      lineTotalMinor: line.lineTotalMinor,
    })),
    subtotalMinor,
    deliveryFeeMinor,
    totalMinor,
  };
}

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
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>('loading');
  const [needsReconfirm, setNeedsReconfirm] = useState(false);
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
  /** Tick so hourly slots re-filter while the form stays open (Europe/Minsk lead). */
  const [slotClock, setSlotClock] = useState(() => Date.now());
  const [agreeWithManager, setAgreeWithManager] = useState(false);
  const [desiredTimeNote, setDesiredTimeNote] = useState('');
  const [purchaserName, setPurchaserName] = useState('');
  const [purchaserPhone, setPurchaserPhone] = useState('');
  /** Flower checkout is gift-first — most orders go to someone else. */
  const [recipientIsMe, setRecipientIsMe] = useState(false);
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

  async function refreshQuote(
    nextCart: CartState,
    nextFulfillment: FulfillmentType,
    opts?: { silent?: boolean },
  ): Promise<CheckoutValidateResponse | null> {
    if (nextCart.items.length === 0) return null;
    setQuoteStatus('loading');
    if (!opts?.silent) setError(null);
    try {
      const valRes = await fetch('/api/v1/checkout/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fulfillmentType: nextFulfillment,
          items: nextCart.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
            ...(i.optionValueIds?.length ? { optionValueIds: i.optionValueIds } : {}),
          })),
          priorUnitPrices: nextCart.items
            .filter((i) => i.unitPriceMinor)
            .map((i) => ({
              variantId: i.variantId,
              unitPriceMinor: i.unitPriceMinor!,
            })),
        }),
      });
      if (!valRes.ok) {
        setValidated(null);
        setQuoteStatus('error');
        setError('Не удалось рассчитать сумму. Нажмите «Пересчитать» и попробуйте снова.');
        return null;
      }
      const quote = (await valRes.json()) as CheckoutValidateResponse;
      setValidated(quote);
      setQuoteStatus(quote.ok ? 'ready' : 'stale');
      setNeedsReconfirm(false);
      if (!quote.ok) {
        setError('В корзине есть недоступные позиции. Исправьте заказ перед оформлением.');
      }
      return quote;
    } catch {
      setValidated(null);
      setQuoteStatus('error');
      setError('Не удалось рассчитать сумму. Проверьте сеть и нажмите «Пересчитать».');
      return null;
    }
  }

  useEffect(() => {
    const c = readCart();
    setCart(c);
    if (c.items.length === 0) return;
    trackEvent('begin_checkout', {
      itemCount: c.items.reduce((s, i) => s + i.quantity, 0),
    });

    void (async () => {
      try {
        const optRes = await fetch('/api/v1/checkout/fulfillment-options', { cache: 'no-store' });
        let nextType: FulfillmentType = 'DELIVERY';
        if (optRes.ok) {
          const opt = (await optRes.json()) as FulfillmentSettingsPublicDto;
          setOptions(opt);
          // Prefer tomorrow — more slots usually available than "today + 1h".
          const [y, m, d] = opt.todayBusinessDate.split('-').map(Number);
          const t = new Date(Date.UTC(y!, m! - 1, d! + 1));
          const tomorrow = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
          setFulfillmentDate(tomorrow);
          setDateMode('tomorrow');
          if (!opt.deliveryEnabled && opt.pickupEnabled) {
            nextType = 'PICKUP';
            setFulfillmentType('PICKUP');
          }
        }
        await refreshQuote(c, nextType);
      } catch {
        setQuoteStatus('error');
        setError('Не удалось загрузить оформление. Обновите страницу.');
      }
    })();
  }, []);

  const cartRef = useRef(cart);
  const optionsRef = useRef(options);
  cartRef.current = cart;
  optionsRef.current = options;
  const fulfillmentBootstrapped = useRef(false);

  useEffect(() => {
    // Skip the first fulfillment paint — initial mount effect already quoted.
    if (!fulfillmentBootstrapped.current) {
      fulfillmentBootstrapped.current = true;
      return;
    }
    const currentCart = cartRef.current;
    if (!optionsRef.current || currentCart.items.length === 0) return;
    void refreshQuote(currentCart, fulfillmentType, { silent: true });
  }, [fulfillmentType]);

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

  useEffect(() => {
    const bump = () => setSlotClock(Date.now());
    const id = window.setInterval(bump, 30_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') bump();
    };
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const windows = useMemo(() => {
    if (!options || !fulfillmentDate) return [];
    return selectableHourlyWindows({
      windows: options.timeWindows,
      fulfillmentDate,
      fulfillmentType,
      now: new Date(slotClock),
      minLeadMinutes: options.minLeadTimeMinutes,
    });
  }, [options, fulfillmentType, fulfillmentDate, slotClock]);

  useEffect(() => {
    if (agreeWithManager) {
      setTimeWindowId(MANAGER_TIME_WINDOW_ID);
      return;
    }
    if (windows.length === 0) {
      if (timeWindowId) {
        setTimeWindowId('');
        setError(
          'Нет доступных интервалов на эту дату — выберите другой день или согласуйте время с менеджером',
        );
      }
      return;
    }
    if (
      timeWindowId &&
      isSelectedSlotStale({
        selectedId: timeWindowId,
        windows: options?.timeWindows ?? [],
        fulfillmentDate,
        fulfillmentType,
        now: new Date(slotClock),
        minLeadMinutes: options?.minLeadTimeMinutes,
      })
    ) {
      setTimeWindowId(windows[0]!.id);
      setError('Выбранный интервал уже недоступен. Выберите другое время — ваши данные сохранены.');
      return;
    }
    if (!windows.some((w) => w.id === timeWindowId)) {
      setTimeWindowId(windows[0]!.id);
    }
  }, [
    agreeWithManager,
    windows,
    timeWindowId,
    options,
    fulfillmentDate,
    fulfillmentType,
    slotClock,
  ]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    if (quoteStatus === 'loading' || quoteStatus === 'error' || !validated?.ok) {
      setError(
        quoteStatus === 'error'
          ? 'Сначала пересчитайте сумму заказа.'
          : 'Дождитесь расчёта суммы или исправьте корзину.',
      );
      setPending(false);
      return;
    }

    if (!purchaserName.trim() || purchaserName.trim().length < 2) {
      setError('Укажите ваше имя');
      setPending(false);
      return;
    }
    if (!purchaserPhone.trim() || purchaserPhone.trim().length < 7) {
      setError('Укажите ваш телефон');
      setPending(false);
      return;
    }

    if (fulfillmentType === 'DELIVERY' && !recipientIsMe) {
      if (!recipientName.trim() || recipientName.trim().length < 2) {
        setError('Укажите имя получателя');
        setPending(false);
        return;
      }
      if (!recipientPhone.trim() || recipientPhone.trim().length < 7) {
        setError('Укажите телефон получателя');
        setPending(false);
        return;
      }
    }

    if (fulfillmentType === 'DELIVERY' && addressKnown && deliveryAddress.trim().length < 5) {
      setError('Укажите адрес доставки');
      setPending(false);
      return;
    }

    const now = new Date();
    setSlotClock(now.getTime());
    const liveWindows =
      options && fulfillmentDate
        ? selectableHourlyWindows({
            windows: options.timeWindows,
            fulfillmentDate,
            fulfillmentType,
            now,
            minLeadMinutes: options.minLeadTimeMinutes,
          })
        : windows;

    if (agreeWithManager) {
      if (!desiredTimeNote.trim()) {
        setError('Укажите желаемое время для согласования с менеджером');
        setPending(false);
        return;
      }
    } else if (
      !timeWindowId ||
      liveWindows.length === 0 ||
      isSelectedSlotStale({
        selectedId: timeWindowId,
        windows: options?.timeWindows ?? [],
        fulfillmentDate,
        fulfillmentType,
        now,
        minLeadMinutes: options?.minLeadTimeMinutes,
      })
    ) {
      if (liveWindows.length > 0) {
        setTimeWindowId(liveWindows[0]!.id);
      } else {
        setTimeWindowId('');
      }
      setError(
        liveWindows.length === 0
          ? 'Нет доступных интервалов на эту дату — выберите другой день или согласуйте время с менеджером'
          : 'Выбранный интервал уже недоступен. Выберите другое время — ваши данные сохранены.',
      );
      setPending(false);
      return;
    }

    const managerNote = agreeWithManager
      ? `Согласовать время с менеджером: ${desiredTimeNote.trim()}`
      : null;
    const mergedComment = [managerNote, customerComment.trim() || null].filter(Boolean).join('\n');

    const confirmedQuote = buildConfirmedQuote(validated, fulfillmentType);

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
      confirmedQuote,
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
        | OrderQuoteMismatchError
        | { message?: string | string[]; error?: string }
        | null;

      if (!res.ok) {
        if (
          res.status === 409 &&
          data &&
          typeof data === 'object' &&
          'error' in data &&
          data.error === 'QuoteMismatch' &&
          'current' in data
        ) {
          const mismatch = data as OrderQuoteMismatchError;
          setValidated(mismatch.current);
          setQuoteStatus(mismatch.current.ok ? 'ready' : 'stale');
          setNeedsReconfirm(true);
          setError(
            mismatch.message ||
              'Сумма заказа изменилась. Проверьте итог и нажмите «Оформить заказ» ещё раз.',
          );
          setPending(false);
          return;
        }
        const msg =
          data && 'message' in data
            ? Array.isArray(data.message)
              ? data.message.join(', ')
              : data.message
            : 'Не удалось создать заказ';
        if (isFulfillmentSlotRejectionMessage(typeof msg === 'string' ? msg : null)) {
          setSlotClock(Date.now());
          setError(
            'Выбранный интервал уже недоступен. Выберите другое время — ваши данные сохранены.',
          );
          setPending(false);
          return;
        }
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

  const canSubmit =
    !pending &&
    quoteStatus === 'ready' &&
    Boolean(validated?.ok) &&
    !validated?.issues.some((i) => i.code !== 'PRICE_CHANGED');

  const submitLabel = pending
    ? 'Отправка…'
    : needsReconfirm
      ? 'Подтвердить новую сумму'
      : 'Оформить заказ';

  if (cart.items.length === 0) {
    return (
      <div className="sf-checkout-empty">
        <p>Корзина пуста</p>
        <Link href="/catalog/bouquets">В каталог</Link>
      </div>
    );
  }

  const deliveryFee =
    fulfillmentType === 'DELIVERY'
      ? BigInt(validated?.deliveryFeeMinor ?? options?.deliveryFeeMinor ?? '0')
      : 0n;
  const subtotal = BigInt(validated?.subtotalMinor ?? '0');
  const total =
    validated && quoteStatus !== 'error'
      ? fulfillmentType === 'DELIVERY'
        ? BigInt(validated.totalMinor)
        : subtotal
      : subtotal + deliveryFee;

  function chipClass(active: boolean) {
    return `sf-checkout-chip${active ? ' sf-checkout-chip--active' : ''}`;
  }

  return (
    <form onSubmit={onSubmit} className="sf-checkout" noValidate>
      <div className="sf-checkout__main">
        <section className="sf-checkout-card">
          <h2 className="sf-checkout-card__title">Получение</h2>
          <div className="sf-checkout-chips">
            {options?.deliveryEnabled !== false ? (
              <button
                type="button"
                className={chipClass(fulfillmentType === 'DELIVERY')}
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
                className={chipClass(fulfillmentType === 'PICKUP')}
                onClick={() => {
                  setFulfillmentType('PICKUP');
                  setSurprise(false);
                  trackEvent('select_fulfillment', { type: 'PICKUP' });
                }}
              >
                Самовывоз
              </button>
            ) : null}
          </div>
        </section>

        <section className="sf-checkout-card">
          <h2 className="sf-checkout-card__title">Дата и время</h2>
          <div className="sf-checkout-chips">
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
                className={chipClass(dateMode === mode)}
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
              className="sf-checkout-input sf-checkout-input--date"
            />
          ) : (
            <p className="sf-checkout-hint">{fulfillmentDate}</p>
          )}

          {!agreeWithManager ? (
            <div className="sf-checkout-field">
              <p className="sf-checkout-label">Время доставки</p>
              {windows.length === 0 ? (
                <p className="sf-checkout-hint">
                  На эту дату свободных слотов нет. Выберите другой день или согласуйте время с
                  менеджером.
                </p>
              ) : (
                <div className="sf-checkout-chips">
                  {windows.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={chipClass(timeWindowId === w.id)}
                      onClick={() => setTimeWindowId(w.id)}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <label className="sf-checkout-field">
              <span className="sf-checkout-label">Желаемое время</span>
              <input
                required
                value={desiredTimeNote}
                onChange={(e) => setDesiredTimeNote(e.target.value)}
                placeholder="Например: сегодня к 23:00 или к 8:30"
                className="sf-checkout-input"
              />
              <span className="sf-checkout-hint">
                Менеджер подтвердит, получится ли доставить вне обычных часов 9:00–21:00.
              </span>
            </label>
          )}

          <label className="sf-checkout-check">
            <input
              type="checkbox"
              checked={agreeWithManager}
              onChange={(e) => setAgreeWithManager(e.target.checked)}
            />
            <span>
              <strong>Согласовать время с менеджером</strong>
              <em>Если нужен час вне списка или доставка вне 9:00–21:00.</em>
            </span>
          </label>
        </section>

        <section className="sf-checkout-card">
          <h2 className="sf-checkout-card__title">Ваши контакты</h2>
          <p className="sf-checkout-card__lead">
            На этот номер мы позвоним, если понадобятся уточнения по заказу.
          </p>
          <div className="sf-checkout-grid">
            <label className="sf-checkout-field">
              <span className="sf-checkout-label">Ваше имя</span>
              <input
                required
                autoComplete="name"
                value={purchaserName}
                onChange={(e) => setPurchaserName(e.target.value)}
                className="sf-checkout-input"
              />
            </label>
            <label className="sf-checkout-field">
              <span className="sf-checkout-label">Ваш телефон</span>
              <input
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+375 29 …"
                value={purchaserPhone}
                onChange={(e) => setPurchaserPhone(e.target.value)}
                className="sf-checkout-input"
              />
            </label>
          </div>
        </section>

        {fulfillmentType === 'DELIVERY' ? (
          <section className="sf-checkout-card">
            <h2 className="sf-checkout-card__title">Кому доставить</h2>
            <div className="sf-checkout-intent" role="group" aria-label="Кому заказ">
              <button
                type="button"
                className={`sf-checkout-intent__btn${!recipientIsMe ? ' sf-checkout-intent__btn--active' : ''}`}
                aria-pressed={!recipientIsMe}
                onClick={() => setRecipientIsMe(false)}
              >
                Другому человеку
              </button>
              <button
                type="button"
                className={`sf-checkout-intent__btn${recipientIsMe ? ' sf-checkout-intent__btn--active' : ''}`}
                aria-pressed={recipientIsMe}
                onClick={() => {
                  setRecipientIsMe(true);
                  setSurprise(false);
                }}
              >
                Мне
              </button>
            </div>

            {!recipientIsMe ? (
              <div className="sf-checkout-grid">
                <label className="sf-checkout-field">
                  <span className="sf-checkout-label">Имя получателя</span>
                  <input
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="sf-checkout-input"
                    placeholder="Как обратиться при вручении"
                  />
                </label>
                <label className="sf-checkout-field">
                  <span className="sf-checkout-label">Телефон получателя</span>
                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="sf-checkout-input"
                    placeholder="+375 …"
                  />
                  <span className="sf-checkout-hint">
                    Нужен, чтобы согласовать вручение. При сюрпризе курьер не назовёт отправителя.
                  </span>
                </label>
              </div>
            ) : (
              <p className="sf-checkout-hint">Доставим вам по указанному адресу.</p>
            )}

            {!recipientIsMe ? (
              <label className="sf-checkout-check sf-checkout-check--accent">
                <input
                  type="checkbox"
                  checked={surprise}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setSurprise(on);
                    if (on) {
                      setWantCard(true);
                      setAnonymousCard(true);
                    }
                  }}
                />
                <span>
                  <strong>Сюрприз — не говорить, от кого</strong>
                  <em>
                    Курьер не раскроет ваше имя. По вопросам доставки мы свяжемся только с вами.
                  </em>
                </span>
              </label>
            ) : null}

            <label className="sf-checkout-check">
              <input
                type="checkbox"
                checked={!addressKnown}
                onChange={(e) => setAddressKnown(!e.target.checked)}
              />
              <span>
                <strong>Точный адрес пока неизвестен</strong>
                <em>Менеджер уточнит детали перед доставкой.</em>
              </span>
            </label>

            {addressKnown ? (
              <label className="sf-checkout-field">
                <span className="sf-checkout-label">Адрес доставки</span>
                <input
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="sf-checkout-input"
                  placeholder="Улица, дом, корпус"
                />
              </label>
            ) : null}

            <label className="sf-checkout-field">
              <span className="sf-checkout-label">Подъезд, этаж, домофон, ориентир</span>
              <input
                value={addressDetails}
                onChange={(e) => setAddressDetails(e.target.value)}
                className="sf-checkout-input"
                placeholder="По желанию"
              />
            </label>
          </section>
        ) : (
          <section className="sf-checkout-card">
            <h2 className="sf-checkout-card__title">Самовывоз</h2>
            <p className="sf-checkout-card__lead">
              {options?.pickupInstructions ??
                'Адрес пункта самовывоза — в разделе «О нас» / контакты магазина.'}
            </p>
          </section>
        )}

        <section className="sf-checkout-card">
          <h2 className="sf-checkout-card__title">Открытка и пожелания</h2>
          <label className="sf-checkout-check">
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
            <span>
              <strong>Добавить открытку</strong>
              <em>Мы напишем текст от руки или напечатаем к букету.</em>
            </span>
          </label>
          {wantCard ? (
            <>
              <label className="sf-checkout-field">
                <span className="sf-checkout-label">Текст открытки</span>
                <textarea
                  maxLength={500}
                  rows={3}
                  value={cardMessage}
                  onChange={(e) => setCardMessage(e.target.value)}
                  className="sf-checkout-input sf-checkout-input--area"
                  placeholder="Ваши тёплые слова…"
                />
              </label>
              <label className="sf-checkout-check">
                <input
                  type="checkbox"
                  checked={anonymousCard}
                  onChange={(e) => setAnonymousCard(e.target.checked)}
                />
                <span>
                  <strong>Без подписи отправителя</strong>
                  <em>На открытке не будет вашего имени.</em>
                </span>
              </label>
            </>
          ) : null}
          <label className="sf-checkout-field">
            <span className="sf-checkout-label">Комментарий к заказу</span>
            <textarea
              maxLength={1000}
              rows={3}
              value={customerComment}
              onChange={(e) => setCustomerComment(e.target.value)}
              className="sf-checkout-input sf-checkout-input--area"
              placeholder="Пожелания курьеру или флористу"
            />
          </label>
        </section>

        {validated?.issues?.length ? (
          <ul className="sf-checkout-issues">
            {validated.issues.map((issue, idx) => (
              <li key={`${issue.code}-${idx}`}>{issue.message}</li>
            ))}
          </ul>
        ) : null}

        {quoteStatus === 'loading' ? (
          <p className="sf-checkout-hint" aria-live="polite">
            Считаем сумму заказа…
          </p>
        ) : null}

        {quoteStatus === 'error' ? (
          <p className="sf-checkout-hint">
            <button
              type="button"
              className="sf-text-link"
              onClick={() => void refreshQuote(cart, fulfillmentType)}
            >
              Пересчитать сумму
            </button>
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="sf-checkout-error">
            {error}
          </p>
        ) : null}

        <p className="sf-checkout-legal">
          Оформляя заказ, вы подтверждаете, что ознакомились с{' '}
          <Link href="/oferta">условиями заказа</Link>, <Link href="/dostavka">доставкой и оплатой</Link>
          , <Link href="/vozvrat">возвратом</Link> и <Link href="/privacy">политикой данных</Link>.
          Оплата на сайте не производится — менеджер сообщит способы после проверки заказа.
        </p>

        <button
          type="submit"
          disabled={!canSubmit}
          className="sf-cta sf-checkout-submit sf-checkout-submit--mobile"
        >
          {submitLabel}
        </button>
      </div>

      <aside className="sf-checkout__summary">
        <h2 className="sf-checkout-card__title">Ваш заказ</h2>
        <ul className="sf-checkout-lines">
          {(validated?.items ?? []).length > 0
            ? validated!.items.map((line) => {
                const cartMatch = cart.items.find(
                  (c) =>
                    c.variantId === line.variantId &&
                    (c.optionValueIds ?? []).slice().sort().join(',') ===
                      (line.optionsSnapshot ?? [])
                        .map((o) => o.valueId)
                        .sort()
                        .join(','),
                );
                const stem = cartMatch ? isStemBouquetLine(cartMatch) : false;
                return (
                  <li
                    key={`${line.variantId}:${(line.optionsSnapshot ?? []).map((o) => o.valueId).join(',')}`}
                  >
                    <span className="sf-checkout-lines__name">
                      {line.productName}
                      {line.variantName ? ` · ${line.variantName}` : ''}
                    </span>
                    {line.optionsSnapshot && line.optionsSnapshot.length > 0 ? (
                      <span className="sf-checkout-lines__meta">
                        {line.optionsSnapshot.map((o) => o.valueName).join(', ')}
                      </span>
                    ) : null}
                    <span className="sf-checkout-lines__meta">
                      {stem
                        ? `${stemCountLabel(line.quantity)} · ${formatPriceFromMinor(line.lineTotalMinor)}`
                        : `× ${line.quantity} · ${formatPriceFromMinor(line.lineTotalMinor)}`}
                    </span>
                  </li>
                );
              })
            : cart.items.map((line) => (
                <li key={`${line.variantId}:${(line.optionValueIds ?? []).join(',')}`}>
                  <span className="sf-checkout-lines__name">
                    {line.productName ?? 'Букет'}
                    {line.variantName ? ` · ${line.variantName}` : ''}
                  </span>
                  <span className="sf-checkout-lines__meta">
                    {isStemBouquetLine(line) ? stemCountLabel(line.quantity) : `× ${line.quantity}`}
                  </span>
                </li>
              ))}
        </ul>
        <div className="sf-checkout-totals">
          <p>
            <span>Товары</span>
            <span>{formatPriceFromMinor(subtotal.toString())}</span>
          </p>
          <p>
            <span>Доставка</span>
            <span>{formatPriceFromMinor(deliveryFee.toString())}</span>
          </p>
          <p className="sf-checkout-totals__grand">
            <span>Итого</span>
            <span>{formatPriceFromMinor(total.toString())}</span>
          </p>
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="sf-cta sf-checkout-submit sf-checkout-submit--desktop"
        >
          {submitLabel}
        </button>
        <p className="sf-checkout-hint">
          Заказ уйдёт в обработку. Менеджер подтвердит детали — это ещё не финальное подтверждение.
        </p>
      </aside>
    </form>
  );
}

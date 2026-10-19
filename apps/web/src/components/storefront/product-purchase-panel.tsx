'use client';

import Image from 'next/image';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ProductListItemDto, ProductPublicDto } from '@bouquet-one/contracts';
import { formatPriceFromMinor, pickDerivativeUrl, sortProductMedia } from '@/lib/media';
import { trackEvent } from '@/lib/analytics';
import {
  addToCart,
  CARD_MESSAGE_MAX,
  MAX_LINE_QTY,
  readCardDraft,
  readCart,
  writeCardDraft,
  writeCart,
} from '@/lib/cart';

type Variant = ProductPublicDto['variants'][number];

type PurchaseProduct = Pick<
  ProductPublicDto,
  | 'id'
  | 'name'
  | 'slug'
  | 'currency'
  | 'availability'
  | 'price'
  | 'promotion'
  | 'media'
  | 'variants'
  | 'shortDescription'
  | 'badgeLabel'
>;

/** Postcard products from the «Открытки» category — added to the cart with the bouquet. */
export type PostcardOption = Pick<
  ProductListItemDto,
  'id' | 'slug' | 'name' | 'primaryImageUrl' | 'defaultVariant' | 'availability' | 'price'
>;

type PurchaseState = {
  product: PurchaseProduct;
  selected: Variant | undefined;
  setSelectedId: (id: string) => void;
  qty: number;
  setQty: (qty: number) => void;
  hydrated: boolean;
  blocked: boolean;
  priceLabel: string;
  originalLabel: string | null;
  cardEnabled: boolean;
  setCardEnabled: (enabled: boolean) => void;
  cardMessage: string;
  setCardMessage: (message: string) => void;
  postcardId: string | null;
  setPostcardId: (id: string | null) => void;
  postcards: PostcardOption[];
  feedback: string | null;
  cartCount: number;
  onAdd: () => void;
};

const PurchaseContext = createContext<PurchaseState | null>(null);

function usePurchase(): PurchaseState {
  const value = useContext(PurchaseContext);
  if (!value) throw new Error('ProductPurchaseProvider is missing');
  return value;
}

export function ProductPurchaseProvider({
  product,
  postcards,
  children,
}: {
  product: PurchaseProduct;
  postcards: PostcardOption[];
  children: ReactNode;
}) {
  const sorted = useMemo(
    () => [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder),
    [product.variants],
  );
  const [selectedId, setSelectedId] = useState(sorted[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [cardEnabled, setCardEnabledState] = useState(true);
  const [cardMessage, setCardMessageState] = useState('');
  const [postcardId, setPostcardId] = useState<string | null>(null);

  const selected = sorted.find((v) => v.id === selectedId) ?? sorted[0];
  const priceLabel = selected
    ? formatPriceFromMinor(selected.effectivePriceMinor, product.currency)
    : product.price.label;
  const discounted = selected != null && selected.effectivePriceMinor !== selected.priceMinor;
  const originalLabel =
    discounted && selected ? formatPriceFromMinor(selected.priceMinor, product.currency) : null;
  const blocked = product.availability === 'TEMPORARILY_UNAVAILABLE' || !selected;

  useEffect(() => {
    setHydrated(true);
    const draft = readCardDraft();
    if (draft.trim()) setCardMessageState(draft);
    const sync = () => {
      const cart = readCart();
      setCartCount(cart.items.reduce((s, i) => s + i.quantity, 0));
    };
    sync();
    window.addEventListener('bouquet:cart', sync as EventListener);
    return () => window.removeEventListener('bouquet:cart', sync as EventListener);
  }, []);

  function setCardEnabled(enabled: boolean) {
    setCardEnabledState(enabled);
    writeCardDraft(enabled ? cardMessage : '');
    if (!enabled) setPostcardId(null);
  }

  function setCardMessage(message: string) {
    const value = message.slice(0, CARD_MESSAGE_MAX);
    setCardMessageState(value);
    writeCardDraft(value);
  }

  function onAdd() {
    if (!selected || blocked) return;
    const primary = sortProductMedia(product.media)[0]?.url ?? null;
    let next = addToCart(readCart(), {
      productId: product.id,
      variantId: selected.id,
      quantity: qty,
      productName: product.name,
      productSlug: product.slug,
      variantName: selected.name,
      unitPriceMinor: selected.effectivePriceMinor,
      primaryImageUrl: primary,
    });
    const postcard = cardEnabled ? postcards.find((p) => p.id === postcardId) : undefined;
    if (postcard?.defaultVariant) {
      const alreadyInCart = next.items.some((i) => i.variantId === postcard.defaultVariant!.id);
      if (!alreadyInCart) {
        next = addToCart(next, {
          productId: postcard.id,
          variantId: postcard.defaultVariant.id,
          quantity: 1,
          productName: postcard.name,
          productSlug: postcard.slug,
          variantName: postcard.defaultVariant.name,
          unitPriceMinor: postcard.defaultVariant.priceMinor,
          primaryImageUrl: postcard.primaryImageUrl,
        });
      }
    }
    writeCart(next);
    trackEvent('add_to_cart', {
      productId: product.id,
      variantId: selected.id,
      quantity: qty,
    });
    setFeedback(postcard ? 'Букет и открытка добавлены в корзину' : 'Добавлено в корзину');
    window.setTimeout(() => setFeedback(null), 2800);
  }

  const value: PurchaseState = {
    product,
    selected,
    setSelectedId,
    qty,
    setQty: (n) => setQty(Math.min(MAX_LINE_QTY, Math.max(1, n))),
    hydrated,
    blocked,
    priceLabel,
    originalLabel,
    cardEnabled,
    setCardEnabled,
    cardMessage,
    setCardMessage,
    postcardId,
    setPostcardId,
    postcards,
    feedback,
    cartCount,
    onAdd,
  };

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

function availabilityBadge(availability: ProductPublicDto['availability']) {
  switch (availability) {
    case 'AVAILABLE':
      return { label: 'В наличии', tone: 'ok' };
    case 'PREORDER':
      return { label: 'Под заказ', tone: 'muted' };
    case 'SEASONAL':
      return { label: 'Сезонный', tone: 'muted' };
    default:
      return { label: 'Временно нет', tone: 'muted' };
  }
}

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function ProductBuyCard({
  whatsappUrl,
  telegramUrl,
  phone,
  children,
}: {
  whatsappUrl: string | null;
  telegramUrl: string | null;
  phone: string | null;
  /** Rendered under the variant picker (e.g. family switcher). */
  children?: ReactNode;
}) {
  const {
    product,
    selected,
    setSelectedId,
    qty,
    setQty,
    hydrated,
    blocked,
    priceLabel,
    originalLabel,
    feedback,
    cartCount,
    onAdd,
  } = usePurchase();
  const sorted = [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder);
  const availability = availabilityBadge(product.availability);
  const percentOff = product.promotion?.percentOff ?? null;
  const badgeLabel = product.badgeLabel?.trim() || null;
  const messengers = [
    whatsappUrl
      ? { key: 'wa', href: whatsappUrl, label: 'WhatsApp', icon: <WhatsAppIcon /> }
      : null,
    telegramUrl
      ? { key: 'tg', href: telegramUrl, label: 'Telegram', icon: <TelegramIcon /> }
      : null,
  ].filter((item) => item != null);

  return (
    <div className="sf-pdp-card sf-pdp-buy" data-purchase-ready={hydrated ? 'true' : 'false'}>
      <div className="sf-pdp-buy__badges">
        <span className={`sf-pdp-badge sf-pdp-badge--${availability.tone}`}>
          {availability.label}
        </span>
        {badgeLabel ? (
          <span className="sf-pdp-badge sf-pdp-badge--accent">{badgeLabel}</span>
        ) : null}
        {percentOff != null ? (
          <span className="sf-pdp-badge sf-pdp-badge--sale">−{percentOff}%</span>
        ) : null}
      </div>

      <h1 className="sf-pdp-buy__title">{product.name}</h1>
      {product.shortDescription ? (
        <p className="sf-pdp-buy__lead">{product.shortDescription}</p>
      ) : null}

      {sorted.length > 1 ? (
        <div className="sf-pdp-buy__block">
          <p className="sf-pdp-buy__label">Размер</p>
          <div className="sf-pdp-variants" role="listbox" aria-label="Размер букета">
            {sorted.map((variant) => {
              const active = variant.id === selected?.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`sf-pdp-variant ${active ? 'sf-pdp-variant--active' : ''}`}
                  onClick={() => setSelectedId(variant.id)}
                >
                  <span className="sf-pdp-variant__name">{variant.name}</span>
                  <span className="sf-pdp-variant__price">
                    {formatPriceFromMinor(variant.effectivePriceMinor, product.currency)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {children}

      <div className="sf-pdp-buy__row">
        <div className="sf-pdp-buy__price" aria-live="polite">
          <p className="sf-pdp-buy__amount" data-sale={originalLabel ? 'true' : 'false'}>
            {priceLabel}
            {originalLabel ? (
              <s className="sf-pdp-buy__was">
                <span className="sr-only">Обычная цена </span>
                {originalLabel}
              </s>
            ) : null}
          </p>
          <p className="sf-pdp-buy__unit">Цена за 1 шт.</p>
        </div>
        <QtyStepper qty={qty} setQty={setQty} disabled={blocked} />
      </div>

      <button
        type="button"
        disabled={blocked || !hydrated}
        onClick={onAdd}
        data-testid="add-to-cart"
        className="sf-pdp-add"
      >
        <CartIcon />
        Добавить в корзину
      </button>

      {messengers.length > 0 ? (
        <div className="sf-pdp-messengers" data-count={messengers.length}>
          {messengers.map((item) => (
            <a
              key={item.key}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`sf-pdp-messenger sf-pdp-messenger--${item.key}`}
            >
              {item.icon}
              <span>
                <span className="sf-pdp-messenger__long">Заказать в </span>
                {item.label}
              </span>
            </a>
          ))}
        </div>
      ) : phone ? (
        <a href={telHref(phone)} className="sf-pdp-call">
          Заказать по телефону {phone}
        </a>
      ) : null}

      {feedback ? (
        <p className="sf-pdp-buy__status" role="status" data-testid="add-to-cart-status">
          {feedback}
          {cartCount > 0 ? (
            <>
              {' · '}
              <a href="/cart">Корзина ({cartCount})</a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function QtyStepper({
  qty,
  setQty,
  disabled,
}: {
  qty: number;
  setQty: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="sf-pdp-stepper" role="group" aria-label="Количество">
      <button
        type="button"
        aria-label="Меньше"
        disabled={disabled || qty <= 1}
        onClick={() => setQty(qty - 1)}
      >
        −
      </button>
      <span aria-live="polite">{qty}</span>
      <button
        type="button"
        aria-label="Больше"
        disabled={disabled || qty >= MAX_LINE_QTY}
        onClick={() => setQty(qty + 1)}
      >
        +
      </button>
    </div>
  );
}

export function ProductPostcardCard() {
  const {
    product,
    cardEnabled,
    setCardEnabled,
    cardMessage,
    setCardMessage,
    postcardId,
    setPostcardId,
    postcards,
  } = usePurchase();
  const [scroller, setScroller] = useState<HTMLUListElement | null>(null);
  const options = postcards.filter((p) => p.id !== product.id && p.defaultVariant);

  function scrollBy(dir: 1 | -1) {
    scroller?.scrollBy({ left: dir * scroller.clientWidth * 0.8, behavior: 'smooth' });
  }

  return (
    <section className="sf-pdp-card sf-pdp-postcard" aria-labelledby="pdp-postcard-title">
      <div className="sf-pdp-postcard__head">
        <GiftIcon />
        <div className="sf-pdp-postcard__heading">
          <h2 id="pdp-postcard-title" className="sf-pdp-postcard__title">
            <span className="sf-pdp-postcard__title-desktop">Добавить открытку</span>
            <span className="sf-pdp-postcard__title-mobile">Открытка к букету</span>
          </h2>
          <p className="sf-pdp-postcard__hint">
            {options.length > 0
              ? 'Выберите открытку и добавьте пожелание — мы напишем его от вашего имени'
              : 'Добавьте пожелание — мы напишем его на открытке от вашего имени'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={cardEnabled}
          aria-labelledby="pdp-postcard-title"
          className="sf-pdp-switch"
          onClick={() => setCardEnabled(!cardEnabled)}
        >
          <span className="sf-pdp-switch__knob" />
        </button>
      </div>

      {cardEnabled ? (
        <div className="sf-pdp-postcard__body">
          {options.length > 0 ? (
            <div className="sf-pdp-postcard__picker">
              <button
                type="button"
                className="sf-pdp-round-nav"
                aria-label="Прокрутить назад"
                onClick={() => scrollBy(-1)}
              >
                ‹
              </button>
              <ul
                ref={setScroller}
                className="sf-pdp-postcard__list"
                role="radiogroup"
                aria-label="Дизайн открытки"
              >
                <li>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={postcardId === null}
                    className="sf-pdp-postcard__option sf-pdp-postcard__option--none"
                    onClick={() => setPostcardId(null)}
                  >
                    <span aria-hidden className="sf-pdp-postcard__plus">
                      +
                    </span>
                    <span className="sf-pdp-postcard__none-label">Без открытки</span>
                  </button>
                </li>
                {options.map((option) => {
                  const priceLabel = option.defaultVariant
                    ? formatPriceFromMinor(option.defaultVariant.priceMinor, product.currency)
                    : (option.price?.label ?? '');
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={postcardId === option.id}
                        className="sf-pdp-postcard__option"
                        onClick={() => setPostcardId(option.id)}
                        title={`${option.name} — ${priceLabel}`}
                      >
                        {option.primaryImageUrl ? (
                          <Image
                            src={option.primaryImageUrl}
                            alt={option.name}
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="sf-pdp-postcard__name">{option.name}</span>
                        )}
                        <span className="sf-pdp-postcard__price">{priceLabel}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="sf-pdp-round-nav"
                aria-label="Прокрутить вперёд"
                onClick={() => scrollBy(1)}
              >
                ›
              </button>
            </div>
          ) : null}

          <label className="sf-pdp-postcard__text">
            <span className="sr-only">Текст для открытки</span>
            <textarea
              rows={2}
              maxLength={CARD_MESSAGE_MAX}
              placeholder="Ваш текст для открытки..."
              value={cardMessage}
              onChange={(event) => setCardMessage(event.target.value)}
            />
            <span className="sf-pdp-postcard__count" aria-hidden>
              {cardMessage.length}/{CARD_MESSAGE_MAX}
            </span>
          </label>
          <p className="sf-pdp-postcard__note">Текст подставится в оформление заказа.</p>
        </div>
      ) : null}
    </section>
  );
}

/** Mobile sticky bar: photo, price, name, «В корзину». */
export function ProductStickyBar() {
  const { product, priceLabel, originalLabel, blocked, hydrated, onAdd } = usePurchase();
  const primary = sortProductMedia(product.media)[0];
  const thumb = primary ? (pickDerivativeUrl(primary, 200) ?? primary.url) : null;

  return (
    <div className="sf-pdp-sticky" aria-label="Быстрая покупка">
      <div className="sf-pdp-sticky__inner">
        {thumb ? (
          <span className="sf-pdp-sticky__thumb">
            <Image src={thumb} alt="" fill sizes="48px" className="object-cover" />
          </span>
        ) : null}
        <span className="sf-pdp-sticky__text">
          <span className="sf-pdp-sticky__price" data-sale={originalLabel ? 'true' : 'false'}>
            {priceLabel}
          </span>
          <span className="sf-pdp-sticky__name">{product.name}</span>
        </span>
        <button
          type="button"
          disabled={blocked || !hydrated}
          onClick={onAdd}
          className="sf-pdp-sticky__btn"
        >
          В корзину
        </button>
      </div>
    </div>
  );
}

function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2" />
      <circle cx="9.5" cy="19.5" r="1.2" />
      <circle cx="17" cy="19.5" r="1.2" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="sf-pdp-postcard__icon"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 11h16v9H4zM3 8h18v3H3zM12 8v12M12 8c-2 0-3.5-1.3-3.5-2.8S10 3 12 5.5C14 3 15.5 3.7 15.5 5.2S14 8 12 8Z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path fill="#25D366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z" />
      <path
        fill="#fff"
        d="M17.3 14.6c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1a7 7 0 0 1-3.4-3c-.3-.4.3-.4.8-1.3.1-.2 0-.3 0-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 .9-1 2.3s1 2.7 1.1 2.9c.1.2 2 3.1 5 4.3 1.8.7 2.5.8 3.4.7.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3Z"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="#1f4f3a"
        d="M21.7 3.3 2.9 10.6c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.2-1.6ZM9 13.4l9.4-5.9c.4-.3.8-.1.5.2l-7.6 6.9-.3 3.3L9 13.4Z"
      />
    </svg>
  );
}

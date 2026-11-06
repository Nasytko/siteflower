'use client';

import Image from 'next/image';
import Link from 'next/link';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  ProductListItemDto,
  ProductOptionGroupDto,
  ProductPublicDto,
} from '@bouquet-one/contracts';
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
import { cartCompositionCount, stemCountLabel } from '@/lib/cart-labels';
import {
  estimateOptionsTotalMinor,
  requiredOptionsMissing,
  resolveOptionSurchargeMinor,
} from '@/lib/product-options';
import { categoryNavHref } from '@/lib/storefront-nav';
import { HomeSectionHead } from '@/components/storefront/home-section-head';

type Variant = ProductPublicDto['variants'][number];

type PurchaseProduct = Pick<
  ProductPublicDto,
  | 'id'
  | 'name'
  | 'slug'
  | 'productKind'
  | 'currency'
  | 'availability'
  | 'price'
  | 'promotion'
  | 'media'
  | 'variants'
  | 'shortDescription'
  | 'optionGroups'
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
  optionGroups: ProductOptionGroupDto[];
  selectedByGroup: Record<string, string[]>;
  toggleOptionValue: (groupId: string, valueId: string, multi: boolean) => void;
  optionsTotalMinor: string;
  /** Bouquet line total (qty × unit + options). */
  lineTotalMinor: string;
  lineTotalLabel: string;
  /** Line total + selected postcard when the addon is on. */
  cartAddTotalLabel: string;
  optionsMissing: boolean;
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
  const [cardEnabled, setCardEnabledState] = useState(false);
  const [cardMessage, setCardMessageState] = useState('');
  const [postcardId, setPostcardId] = useState<string | null>(null);
  const optionGroups = useMemo(
    () => (product.optionGroups ?? []).filter((group) => group.values.some((v) => v.active)),
    [product.optionGroups],
  );
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});

  const selected = sorted.find((v) => v.id === selectedId) ?? sorted[0];
  const priceLabel = selected
    ? formatPriceFromMinor(selected.effectivePriceMinor, product.currency)
    : product.price.label;
  const discounted = selected != null && selected.effectivePriceMinor !== selected.priceMinor;
  const originalLabel =
    discounted && selected ? formatPriceFromMinor(selected.priceMinor, product.currency) : null;
  const optionsEstimate = selected
    ? estimateOptionsTotalMinor({
        groups: optionGroups,
        variantId: selected.id,
        selectedByGroup,
        quantity: qty,
        baseUnitPriceMinor: selected.effectivePriceMinor,
      })
    : { optionValueIds: [] as string[], optionsTotalMinor: '0', lineTotalMinor: '0' };
  const lineTotalMinor = optionsEstimate.lineTotalMinor;
  const lineTotalLabel = formatPriceFromMinor(lineTotalMinor, product.currency);
  const selectedPostcard =
    cardEnabled && postcardId
      ? postcards.find((p) => p.id === postcardId && p.defaultVariant)
      : undefined;
  const cartAddTotalMinor = selectedPostcard?.defaultVariant
    ? (BigInt(lineTotalMinor) + BigInt(selectedPostcard.defaultVariant.priceMinor)).toString()
    : lineTotalMinor;
  const cartAddTotalLabel = formatPriceFromMinor(cartAddTotalMinor, product.currency);
  const optionsMissing = requiredOptionsMissing(optionGroups, selectedByGroup);
  const blocked =
    product.availability === 'TEMPORARILY_UNAVAILABLE' || !selected || optionsMissing;

  function toggleOptionValue(groupId: string, valueId: string, multi: boolean) {
    setSelectedByGroup((prev) => {
      const current = prev[groupId] ?? [];
      if (multi) {
        const next = current.includes(valueId)
          ? current.filter((id) => id !== valueId)
          : [...current, valueId];
        return { ...prev, [groupId]: next };
      }
      if (current.length === 1 && current[0] === valueId) {
        return { ...prev, [groupId]: [] };
      }
      return { ...prev, [groupId]: [valueId] };
    });
  }

  useEffect(() => {
    setHydrated(true);
    const draft = readCardDraft();
    if (draft.trim()) setCardMessageState(draft);
    const sync = () => {
      setCartCount(cartCompositionCount(readCart()));
    };
    sync();
    window.addEventListener('bouquet:cart', sync as EventListener);
    return () => window.removeEventListener('bouquet:cart', sync as EventListener);
  }, []);

  function setCardEnabled(enabled: boolean) {
    setCardEnabledState(enabled);
    writeCardDraft(enabled ? cardMessage : '');
    if (!enabled) {
      setPostcardId(null);
      return;
    }
    setPostcardId((current) => {
      if (current) return current;
      const available = postcards.filter((p) => p.id !== product.id && p.defaultVariant);
      if (available.length === 0) return null;
      const cheapest = available.reduce((best, item) => {
        const price = BigInt(item.defaultVariant!.priceMinor);
        const bestPrice = BigInt(best.defaultVariant!.priceMinor);
        return price < bestPrice ? item : best;
      });
      return cheapest.id;
    });
  }

  function setCardMessage(message: string) {
    const value = message.slice(0, CARD_MESSAGE_MAX);
    setCardMessageState(value);
    writeCardDraft(value);
  }

  function onAdd() {
    if (!selected || blocked) return;
    const primary = sortProductMedia(product.media)[0]?.url ?? null;
    const estimate = estimateOptionsTotalMinor({
      groups: optionGroups,
      variantId: selected.id,
      selectedByGroup,
      quantity: qty,
      baseUnitPriceMinor: selected.effectivePriceMinor,
    });
    const isStem = product.productKind === 'STEM';
    let next = addToCart(readCart(), {
      productId: product.id,
      variantId: selected.id,
      quantity: qty,
      productKind: product.productKind,
      optionValueIds: estimate.optionValueIds.length ? estimate.optionValueIds : undefined,
      productName: product.name,
      productSlug: product.slug,
      variantName: selected.name,
      unitPriceMinor: selected.effectivePriceMinor,
      optionsTotalMinor: estimate.optionsTotalMinor,
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
          productKind: 'GIFT',
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
      productKind: product.productKind,
    });
    const stemFeedback = isStem ? `Букет · ${stemCountLabel(qty)}` : 'Добавлено в корзину';
    setFeedback(postcard ? `${stemFeedback} + открытка` : stemFeedback);
    window.setTimeout(() => setFeedback(null), 2800);
  }

  const value: PurchaseState = {
    product,
    selected,
    setSelectedId,
    qty,
    setQty: (n) => setQty(Math.min(MAX_LINE_QTY, Math.max(1, n))),
    optionGroups,
    selectedByGroup,
    toggleOptionValue,
    optionsTotalMinor: optionsEstimate.optionsTotalMinor,
    lineTotalMinor,
    lineTotalLabel,
    cartAddTotalLabel,
    optionsMissing,
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
  showPostcardAnchor = false,
  children,
}: {
  whatsappUrl: string | null;
  telegramUrl: string | null;
  phone: string | null;
  /** Secondary CTA that scrolls to the postcard shelf. */
  showPostcardAnchor?: boolean;
  /** Rendered under the variant picker (e.g. family switcher). */
  children?: ReactNode;
}) {
  const {
    product,
    selected,
    setSelectedId,
    qty,
    setQty,
    optionGroups,
    selectedByGroup,
    toggleOptionValue,
    optionsTotalMinor,
    lineTotalLabel,
    cartAddTotalLabel,
    optionsMissing,
    hydrated,
    blocked,
    priceLabel,
    originalLabel,
    feedback,
    cartCount,
    onAdd,
    cardEnabled,
    setCardEnabled,
  } = usePurchase();
  const sorted = [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder);
  const availability = availabilityBadge(product.availability);
  const percentOff = product.promotion?.percentOff ?? null;
  const optionsTotalLabel =
    optionsTotalMinor !== '0'
      ? formatPriceFromMinor(optionsTotalMinor, product.currency)
      : null;
  const addButtonLabel =
    product.productKind === 'STEM'
      ? `В корзину · ${cartAddTotalLabel}`
      : `В корзину · ${cartAddTotalLabel}`;
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
        {percentOff != null ? (
          <span className="sf-pdp-badge sf-pdp-badge--sale">−{percentOff}%</span>
        ) : null}
      </div>

      <h1 className="sf-pdp-buy__title">{product.name}</h1>
      {product.shortDescription ? (
        <p className="sf-pdp-buy__lead">{product.shortDescription}</p>
      ) : null}

      {(sorted.length > 1 || children || optionGroups.length > 0) ? (
        <div className="sf-pdp-buy__configure">
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

          {optionGroups.length > 0 ? (
            <div className="sf-pdp-options" data-testid="product-options">
              {optionGroups.map((group) => {
                const multi = group.selection === 'MULTI';
                const picked = selectedByGroup[group.id] ?? [];
                return (
                  <div key={group.id} className="sf-pdp-options__group">
                    <p className="sf-pdp-buy__label">
                      {group.name}
                      {group.required ? ' *' : ''}
                    </p>
                    <div
                      className="sf-pdp-variants"
                      role={multi ? 'group' : 'listbox'}
                      aria-label={group.name}
                    >
                      {group.values
                        .filter((value) => value.active)
                        .map((value) => {
                          const active = picked.includes(value.id);
                          const unitMinor = selected
                            ? BigInt(selected.effectivePriceMinor)
                            : 0n;
                          const baseLineMinor = unitMinor * BigInt(qty);
                          const surcharge = resolveOptionSurchargeMinor(
                            value,
                            selected?.id,
                            baseLineMinor,
                          );
                          const surchargeLabel =
                            surcharge === 0n
                              ? value.pricingMode === 'TIERED'
                                ? 'по шкале'
                                : 'вкл.'
                              : `+${formatPriceFromMinor(surcharge.toString(), product.currency)}`;
                          return (
                            <button
                              key={value.id}
                              type="button"
                              role={multi ? 'checkbox' : 'option'}
                              aria-checked={multi ? active : undefined}
                              aria-selected={!multi ? active : undefined}
                              className={`sf-pdp-variant ${active ? 'sf-pdp-variant--active' : ''}`}
                              onClick={() => toggleOptionValue(group.id, value.id, multi)}
                            >
                              <span className="sf-pdp-variant__name">{value.name}</span>
                              <span className="sf-pdp-variant__price">{surchargeLabel}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
              {optionsMissing ? (
                <p className="sf-small text-muted">Выберите обязательные опции</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="sf-pdp-buy__row">
        <div className="sf-pdp-buy__price" aria-live="polite">
          <p className="sf-pdp-buy__amount" data-sale={originalLabel ? 'true' : 'false'}>
            {lineTotalLabel}
            {originalLabel && qty === 1 && optionsTotalMinor === '0' ? (
              <s className="sf-pdp-buy__was">
                <span className="sr-only">Обычная цена </span>
                {originalLabel}
              </s>
            ) : null}
          </p>
          <p className="sf-pdp-buy__unit">
            {product.productKind === 'STEM'
              ? `${priceLabel} за ветку · ${stemCountLabel(qty)}`
              : qty > 1
                ? `${priceLabel} × ${qty}`
                : 'Цена за 1 шт.'}
            {optionsTotalLabel ? ` · опции ${optionsTotalLabel}` : ''}
          </p>
        </div>
        <QtyStepper
          qty={qty}
          setQty={setQty}
          disabled={product.availability === 'TEMPORARILY_UNAVAILABLE' || !selected}
          stemMode={product.productKind === 'STEM'}
        />
      </div>

      {product.productKind === 'STEM' ? (
        <p className="sf-pdp-buy__stem-hint" role="note">
          {stemCountLabel(qty)} собираем в один букет
          {optionGroups.length > 0 ? '; лента и упаковка — один раз' : ''}.
        </p>
      ) : null}

      <div className="sf-pdp-buy__cta">
        <button
          type="button"
          disabled={blocked || !hydrated}
          onClick={onAdd}
          data-testid="add-to-cart"
          className="sf-pdp-add"
        >
          <CartIcon />
          <span className="sf-pdp-add__label">{addButtonLabel}</span>
        </button>
        {showPostcardAnchor ? (
          <button
            type="button"
            className="sf-pdp-add-secondary"
            data-active={cardEnabled ? 'true' : 'false'}
            onClick={() => {
              if (!cardEnabled) setCardEnabled(true);
              document
                .getElementById('pdp-postcards')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <GiftIcon />
            {cardEnabled ? 'Выбрать дизайн открытки' : 'Добавить открытку'}
          </button>
        ) : null}
      </div>

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
  stemMode = false,
}: {
  qty: number;
  setQty: (n: number) => void;
  disabled: boolean;
  stemMode?: boolean;
}) {
  return (
    <div
      className="sf-pdp-stepper"
      role="group"
      aria-label={stemMode ? 'Количество веток в букете' : 'Количество'}
    >
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

const POSTCARD_CATALOG_HREF = categoryNavHref('otkrytki');

function postcardOptions(postcards: PostcardOption[], productId: string) {
  return postcards.filter((p) => p.id !== productId && p.defaultVariant);
}

function minPostcardPriceLabel(options: PostcardOption[], currency: string): string | null {
  if (options.length === 0) return null;
  const minMinor = options.reduce((min, item) => {
    const price = BigInt(item.defaultVariant!.priceMinor);
    return price < min ? price : min;
  }, BigInt(options[0]!.defaultVariant!.priceMinor));
  return formatPriceFromMinor(minMinor.toString(), currency);
}

export function ProductPostcardCard() {
  const {
    product,
    cardEnabled,
    setCardEnabled,
    cardMessage,
    setCardMessage,
    postcardId,
    postcards,
  } = usePurchase();
  const options = postcardOptions(postcards, product.id);
  const fromPrice = minPostcardPriceLabel(options, product.currency);
  const selected = postcardId
    ? options.find((item) => item.id === postcardId)
    : undefined;

  return (
    <section
      className="sf-pdp-card sf-pdp-postcard"
      data-on={cardEnabled ? 'true' : 'false'}
      aria-labelledby="pdp-postcard-title"
    >
      <div className="sf-pdp-postcard__head">
        <span className="sf-pdp-postcard__icon" aria-hidden>
          <GiftIcon />
        </span>
        <div className="sf-pdp-postcard__heading">
          <h2 id="pdp-postcard-title" className="sf-pdp-postcard__title">
            Открытка к букету
          </h2>
          <p className="sf-pdp-postcard__hint">
            {fromPrice ? (
              <>
                От {fromPrice}. Текст напишем от вашего имени —{' '}
                <a href="#pdp-postcards">выберите дизайн</a>
                {' '}или смотрите{' '}
                <Link href={POSTCARD_CATALOG_HREF}>все открытки</Link>.
              </>
            ) : (
              <>Мы напишем пожелание от вашего имени.</>
            )}
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
          {selected ? (
            <button
              type="button"
              className="sf-pdp-postcard__pick"
              onClick={() =>
                document
                  .getElementById('pdp-postcards')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              {selected.primaryImageUrl ? (
                <span className="sf-pdp-postcard__pick-thumb">
                  <Image
                    src={selected.primaryImageUrl}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </span>
              ) : null}
              <span className="sf-pdp-postcard__pick-text">
                <span className="sf-pdp-postcard__pick-name">{selected.name}</span>
                <span className="sf-pdp-postcard__pick-meta">Сменить дизайн</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="sf-pdp-postcard__pick sf-pdp-postcard__pick--empty"
              onClick={() =>
                document
                  .getElementById('pdp-postcards')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              Выбрать дизайн открытки
            </button>
          )}
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

/** Selectable postcard shelf under the product — before similar items. */
export function ProductPostcardShelf() {
  const {
    product,
    cardEnabled,
    setCardEnabled,
    postcardId,
    setPostcardId,
    postcards,
  } = usePurchase();
  const options = postcardOptions(postcards, product.id);
  if (options.length === 0) return null;

  function selectPostcard(id: string) {
    setPostcardId(id);
    if (!cardEnabled) setCardEnabled(true);
  }

  return (
    <section id="pdp-postcards" className="sf-pdp-postcards" aria-label="Открытки к букету">
      <HomeSectionHead
        title="Открытки к букету"
        href={POSTCARD_CATALOG_HREF}
        linkLabel="Все открытки"
      />
      <ul className="sf-pdp-postcards__list" role="radiogroup" aria-label="Дизайн открытки">
        {options.map((option) => {
          const priceLabel = option.defaultVariant
            ? formatPriceFromMinor(option.defaultVariant.priceMinor, product.currency)
            : (option.price?.label ?? '');
          const selected = postcardId === option.id;
          return (
            <li key={option.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={`sf-product-card sf-pdp-postcards__card group${
                  selected ? ' sf-pdp-postcards__card--selected' : ''
                }`}
                onClick={() => selectPostcard(option.id)}
              >
                <span className="sf-product-card__media">
                  {option.primaryImageUrl ? (
                    <Image
                      src={option.primaryImageUrl}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 42vw, (max-width: 1024px) 28vw, 200px"
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <span className="sf-pdp-postcards__photo-fallback">Фото скоро</span>
                  )}
                </span>
                <span className="sf-product-card__body">
                  <span className="sf-product-card__title">{option.name}</span>
                  <span className="sf-product-card__buy">
                    <span className="sf-product-card__price">
                      {priceLabel ? (
                        <span className="sf-price">{priceLabel}</span>
                      ) : (
                        <span className="sf-small text-muted">Цена уточняется</span>
                      )}
                    </span>
                    <span
                      className="sf-product-card__cart"
                      aria-hidden
                      data-selected={selected ? 'true' : 'false'}
                    >
                      {selected ? <CheckIcon /> : <PlusIcon />}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Sticky buy bar — slides up when main CTA leaves the viewport (mobile + desktop). */
export function ProductStickyBar() {
  const {
    product,
    cartAddTotalLabel,
    originalLabel,
    blocked,
    hydrated,
    onAdd,
  } = usePurchase();
  const [visible, setVisible] = useState(false);
  const primary = sortProductMedia(product.media)[0];
  const thumb = primary ? (pickDerivativeUrl(primary, 200) ?? primary.url) : null;

  useEffect(() => {
    const cta = document.querySelector<HTMLElement>('[data-testid="add-to-cart"]');
    if (!cta) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!(entry?.isIntersecting ?? true));
      },
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(cta);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="sf-pdp-sticky"
      data-visible={visible ? 'true' : 'false'}
      aria-hidden={visible ? undefined : true}
      aria-label={visible ? 'Быстрая покупка' : undefined}
    >
      <div className="sf-pdp-sticky__inner">
        {thumb ? (
          <span className="sf-pdp-sticky__thumb">
            <Image src={thumb} alt="" fill sizes="48px" className="object-cover" />
          </span>
        ) : null}
        <span className="sf-pdp-sticky__text">
          <span className="sf-pdp-sticky__price" data-sale={originalLabel ? 'true' : 'false'}>
            {cartAddTotalLabel}
          </span>
          <span className="sf-pdp-sticky__name">{product.name}</span>
        </span>
        <button
          type="button"
          disabled={blocked || !hydrated}
          tabIndex={visible ? 0 : -1}
          onClick={onAdd}
          className="sf-pdp-sticky__btn"
        >
          В корзину · {cartAddTotalLabel}
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

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5.5 12.5 4.2 4.2 8.8-9.2" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
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

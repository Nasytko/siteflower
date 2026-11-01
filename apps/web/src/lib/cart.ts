/**
 * Client cart — productId/variantId/quantity (+ optional optionValueIds).
 * Display fields are UX cache; server re-quotes on validate/checkout.
 * Option surcharges are never trusted from the browser.
 */

export const CART_STORAGE_KEY = 'bouquet-one:cart:v1';
export const MAX_LINE_QTY = 20;

export type CartLine = {
  productId: string;
  variantId: string;
  quantity: number;
  /** Selected ProductOptionValue ids (server-validated at checkout). */
  optionValueIds?: string[];
  /** Display cache only — never trust for checkout totals. */
  productName?: string;
  productSlug?: string;
  variantName?: string;
  /** Variant unit after promo, excluding options (mirrors OrderItem.unitPriceMinor). */
  unitPriceMinor?: string;
  /** Cached option surcharges for the line; omit/0 when none. Not baked into unitPriceMinor. */
  optionsTotalMinor?: string;
  primaryImageUrl?: string | null;
};

export type CartState = {
  version: 1;
  items: CartLine[];
};

export function emptyCart(): CartState {
  return { version: 1, items: [] };
}

/** Merge identity: same variant with different options = separate lines. */
export function cartLineKey(line: {
  variantId: string;
  optionValueIds?: readonly string[];
}): string {
  const opts = [...(line.optionValueIds ?? [])].filter(Boolean).sort().join(',');
  return `${line.variantId}:${opts}`;
}

function normalizeOptionValueIds(ids: string[] | undefined): string[] | undefined {
  if (!ids || ids.length === 0) return undefined;
  return [...new Set(ids.filter(Boolean))];
}

export function parseCart(raw: string | null): CartState {
  if (!raw) return emptyCart();
  try {
    const parsed = JSON.parse(raw) as CartState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) return emptyCart();
    return {
      version: 1,
      items: parsed.items
        .filter(
          (item) =>
            typeof item?.productId === 'string' &&
            typeof item?.variantId === 'string' &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0,
        )
        .map((item) => ({
          ...item,
          optionValueIds: normalizeOptionValueIds(
            Array.isArray(item.optionValueIds)
              ? item.optionValueIds.filter((id): id is string => typeof id === 'string')
              : undefined,
          ),
        })),
    };
  } catch {
    return emptyCart();
  }
}

export function readCart(): CartState {
  if (typeof window === 'undefined') return emptyCart();
  return parseCart(window.localStorage.getItem(CART_STORAGE_KEY));
}

export function writeCart(state: CartState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('bouquet:cart', { detail: state }));
  } catch {
    /* ignore */
  }
}

export function cartItemCount(state: CartState): number {
  return state.items.reduce((sum, line) => sum + line.quantity, 0);
}

export function addToCart(state: CartState, line: CartLine): CartState {
  const qty = Math.min(MAX_LINE_QTY, Math.max(1, line.quantity));
  const optionValueIds = normalizeOptionValueIds(line.optionValueIds);
  const key = cartLineKey({ variantId: line.variantId, optionValueIds });
  const existing = state.items.find((i) => cartLineKey(i) === key);
  if (existing) {
    return {
      version: 1,
      items: state.items.map((i) =>
        cartLineKey(i) === key
          ? {
              ...i,
              ...line,
              optionValueIds,
              quantity: Math.min(MAX_LINE_QTY, i.quantity + qty),
            }
          : i,
      ),
    };
  }
  return {
    version: 1,
    items: [...state.items, { ...line, optionValueIds, quantity: qty }],
  };
}

export function setCartQuantity(
  state: CartState,
  lineKey: string,
  quantity: number,
): CartState {
  if (quantity < 1) {
    return {
      version: 1,
      items: state.items.filter((i) => cartLineKey(i) !== lineKey),
    };
  }
  return {
    version: 1,
    items: state.items.map((i) =>
      cartLineKey(i) === lineKey
        ? { ...i, quantity: Math.min(MAX_LINE_QTY, quantity) }
        : i,
    ),
  };
}

export function removeFromCart(state: CartState, lineKey: string): CartState {
  return {
    version: 1,
    items: state.items.filter((i) => cartLineKey(i) !== lineKey),
  };
}

export function clearCart(): CartState {
  return emptyCart();
}

/** Postcard text typed on the product page; prefilled into checkout `cardMessage`. */
export const CARD_DRAFT_STORAGE_KEY = 'bouquet-one:card-draft:v1';
export const CARD_MESSAGE_MAX = 200;

export function readCardDraft(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (window.localStorage.getItem(CARD_DRAFT_STORAGE_KEY) ?? '').slice(0, CARD_MESSAGE_MAX);
  } catch {
    return '';
  }
}

export function writeCardDraft(message: string): void {
  if (typeof window === 'undefined') return;
  try {
    const value = message.slice(0, CARD_MESSAGE_MAX);
    if (value.trim()) window.localStorage.setItem(CARD_DRAFT_STORAGE_KEY, value);
    else window.localStorage.removeItem(CARD_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Client cart — productId/variantId/quantity only.
 * Display fields are UX cache; server re-quotes on validate/checkout.
 */

export const CART_STORAGE_KEY = 'bouquet-one:cart:v1';
export const MAX_LINE_QTY = 20;

export type CartLine = {
  productId: string;
  variantId: string;
  quantity: number;
  /** Display cache only */
  productName?: string;
  productSlug?: string;
  variantName?: string;
  unitPriceMinor?: string;
  primaryImageUrl?: string | null;
};

export type CartState = {
  version: 1;
  items: CartLine[];
};

export function emptyCart(): CartState {
  return { version: 1, items: [] };
}

export function parseCart(raw: string | null): CartState {
  if (!raw) return emptyCart();
  try {
    const parsed = JSON.parse(raw) as CartState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) return emptyCart();
    return {
      version: 1,
      items: parsed.items.filter(
        (item) =>
          typeof item?.productId === 'string' &&
          typeof item?.variantId === 'string' &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0,
      ),
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

export function addToCart(
  state: CartState,
  line: CartLine,
): CartState {
  const qty = Math.min(MAX_LINE_QTY, Math.max(1, line.quantity));
  const existing = state.items.find((i) => i.variantId === line.variantId);
  if (existing) {
    return {
      version: 1,
      items: state.items.map((i) =>
        i.variantId === line.variantId
          ? {
              ...i,
              ...line,
              quantity: Math.min(MAX_LINE_QTY, i.quantity + qty),
            }
          : i,
      ),
    };
  }
  return { version: 1, items: [...state.items, { ...line, quantity: qty }] };
}

export function setCartQuantity(
  state: CartState,
  variantId: string,
  quantity: number,
): CartState {
  if (quantity < 1) {
    return {
      version: 1,
      items: state.items.filter((i) => i.variantId !== variantId),
    };
  }
  return {
    version: 1,
    items: state.items.map((i) =>
      i.variantId === variantId
        ? { ...i, quantity: Math.min(MAX_LINE_QTY, quantity) }
        : i,
    ),
  };
}

export function removeFromCart(state: CartState, variantId: string): CartState {
  return {
    version: 1,
    items: state.items.filter((i) => i.variantId !== variantId),
  };
}

export function clearCart(): CartState {
  return emptyCart();
}

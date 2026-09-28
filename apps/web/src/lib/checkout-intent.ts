/**
 * Checkout intent from PDP — gift / greeting card preferences
 * carried into checkout without polluting the cart line schema.
 */

export const CHECKOUT_INTENT_KEY = 'bouquet-one:checkout-intent:v1';

export type CheckoutIntent = {
  isGift: boolean;
  wantCard: boolean;
  /** Optional draft text for the greeting card */
  cardDraft: string;
};

export function emptyCheckoutIntent(): CheckoutIntent {
  return { isGift: false, wantCard: false, cardDraft: '' };
}

export function readCheckoutIntent(): CheckoutIntent {
  if (typeof window === 'undefined') return emptyCheckoutIntent();
  try {
    const raw = sessionStorage.getItem(CHECKOUT_INTENT_KEY);
    if (!raw) return emptyCheckoutIntent();
    const parsed = JSON.parse(raw) as Partial<CheckoutIntent>;
    return {
      isGift: Boolean(parsed.isGift),
      wantCard: Boolean(parsed.wantCard),
      cardDraft: typeof parsed.cardDraft === 'string' ? parsed.cardDraft.slice(0, 500) : '',
    };
  } catch {
    return emptyCheckoutIntent();
  }
}

export function writeCheckoutIntent(intent: CheckoutIntent): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      CHECKOUT_INTENT_KEY,
      JSON.stringify({
        isGift: intent.isGift,
        wantCard: intent.wantCard,
        cardDraft: intent.cardDraft.slice(0, 500),
      }),
    );
  } catch {
    /* private mode */
  }
}

export function clearCheckoutIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CHECKOUT_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

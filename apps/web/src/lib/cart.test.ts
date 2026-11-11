import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addToCart,
  CARD_DRAFT_STORAGE_KEY,
  cartLineKey,
  clearCart,
  emptyCart,
  parseCart,
  formatOrderCardMessage,
  removeFromCart,
  setCartQuantity,
  syncCardDraftWithCart,
  writeCardDraft,
} from './cart';

test('addToCart merges same variant', () => {
  let cart = emptyCart();
  cart = addToCart(cart, {
    productId: 'p1',
    variantId: 'v1',
    quantity: 2,
  });
  cart = addToCart(cart, {
    productId: 'p1',
    variantId: 'v1',
    quantity: 3,
  });
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0]?.quantity, 5);
});

test('addToCart keeps separate lines for different options', () => {
  let cart = emptyCart();
  cart = addToCart(cart, {
    productId: 'p1',
    variantId: 'v1',
    quantity: 1,
    optionValueIds: ['wrap'],
  });
  cart = addToCart(cart, {
    productId: 'p1',
    variantId: 'v1',
    quantity: 1,
    optionValueIds: ['ribbon'],
  });
  assert.equal(cart.items.length, 2);
});

test('addToCart merges identical option sets and sums quantity', () => {
  let cart = emptyCart();
  cart = addToCart(cart, {
    productId: 'p1',
    variantId: 'v1',
    quantity: 2,
    optionValueIds: ['wrap', 'ribbon'],
  });
  cart = addToCart(cart, {
    productId: 'p1',
    variantId: 'v1',
    quantity: 3,
    // Order of ids must not create a second line
    optionValueIds: ['ribbon', 'wrap'],
  });
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0]?.quantity, 5);
  assert.deepEqual([...(cart.items[0]?.optionValueIds ?? [])].sort(), ['ribbon', 'wrap']);
});

test('quantity capped at 20', () => {
  let cart = emptyCart();
  cart = addToCart(cart, { productId: 'p1', variantId: 'v1', quantity: 15 });
  cart = addToCart(cart, { productId: 'p1', variantId: 'v1', quantity: 10 });
  assert.equal(cart.items[0]?.quantity, 20);
});

test('setCartQuantity removes at zero', () => {
  let cart = addToCart(emptyCart(), {
    productId: 'p1',
    variantId: 'v1',
    quantity: 1,
  });
  cart = setCartQuantity(cart, cartLineKey(cart.items[0]!), 0);
  assert.equal(cart.items.length, 0);
});

test('removeFromCart', () => {
  let cart = addToCart(emptyCart(), {
    productId: 'p1',
    variantId: 'v1',
    quantity: 1,
  });
  cart = removeFromCart(cart, cartLineKey(cart.items[0]!));
  assert.equal(cart.items.length, 0);
});

test('parseCart rejects garbage', () => {
  assert.equal(parseCart('not-json').items.length, 0);
  assert.equal(parseCart('{"version":2,"items":[]}').items.length, 0);
});

test('postcard stays with its bouquet and leaves with it', () => {
  const bouquet = { productId: 'rose', variantId: 'rose-v', quantity: 1, productName: 'Роза' };
  let cart = addToCart(emptyCart(), bouquet);
  const parentKey = cartLineKey(bouquet);
  cart = addToCart(cart, {
    productId: 'card',
    variantId: 'card-v',
    quantity: 1,
    productName: 'Открытка Мама',
    inscription: true,
    cardMessage: 'Любимой маме',
    attachedToKey: parentKey,
  });
  cart = addToCart(cart, {
    productId: 'card',
    variantId: 'card-v',
    quantity: 1,
    productName: 'Открытка Мама',
    inscription: true,
    cardMessage: 'Отдельно',
  });
  assert.equal(cart.items.length, 3);
  assert.equal(
    formatOrderCardMessage(cart.items),
    'К «Роза»: Любимой маме\nНа «Открытка Мама»: Отдельно',
  );

  cart = removeFromCart(cart, parentKey);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0]?.cardMessage, 'Отдельно');
});

test('clearCart and empty cart clear postcard draft; active cart keeps it', () => {
  const memory = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
  // @ts-expect-error test shim
  globalThis.window = { localStorage };

  writeCardDraft('С днём рождения!');
  assert.equal(memory.get(CARD_DRAFT_STORAGE_KEY), 'С днём рождения!');

  let cart = addToCart(emptyCart(), {
    productId: 'bouquet-a',
    variantId: 'v-a',
    quantity: 1,
  });
  cart = addToCart(cart, {
    productId: 'bouquet-b',
    variantId: 'v-b',
    quantity: 1,
  });
  syncCardDraftWithCart(cart);
  assert.equal(memory.get(CARD_DRAFT_STORAGE_KEY), 'С днём рождения!');

  cart = removeFromCart(cart, cartLineKey(cart.items[0]!));
  syncCardDraftWithCart(cart);
  assert.equal(memory.get(CARD_DRAFT_STORAGE_KEY), 'С днём рождения!');

  cart = removeFromCart(cart, cartLineKey(cart.items[0]!));
  syncCardDraftWithCart(cart);
  assert.equal(memory.has(CARD_DRAFT_STORAGE_KEY), false);

  writeCardDraft('Ещё раз');
  clearCart();
  assert.equal(memory.has(CARD_DRAFT_STORAGE_KEY), false);
});

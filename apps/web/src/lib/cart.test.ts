import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addToCart,
  emptyCart,
  parseCart,
  removeFromCart,
  setCartQuantity,
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
  cart = setCartQuantity(cart, 'v1', 0);
  assert.equal(cart.items.length, 0);
});

test('removeFromCart', () => {
  let cart = addToCart(emptyCart(), {
    productId: 'p1',
    variantId: 'v1',
    quantity: 1,
  });
  cart = removeFromCart(cart, 'v1');
  assert.equal(cart.items.length, 0);
});

test('parseCart rejects garbage', () => {
  assert.equal(parseCart('not-json').items.length, 0);
  assert.equal(parseCart('{"version":2,"items":[]}').items.length, 0);
});

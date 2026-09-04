/*
 * The checkout's amount rule — the one the customer hears before any
 * money moves.
 *
 * The rule under test throughout: a total under 1 or over 1,000 ILS is
 * blocked in the UI, and ANYTHING the client cannot judge with certainty
 * is let through to the backend that owns the real answer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECKOUT_LIMIT_CURRENCY,
  MAX_CHECKOUT_TOTAL,
  MIN_CHECKOUT_TOTAL,
  checkoutAmountLimit,
} from './checkoutAmountLimits.js';

/*
|--------------------------------------------------------------------------
| The bounds
|--------------------------------------------------------------------------
*/

test('the bounds are 1 and 1,000 ILS', () => {
  assert.equal(MIN_CHECKOUT_TOTAL, 1);
  assert.equal(MAX_CHECKOUT_TOTAL, 1000);
  assert.equal(CHECKOUT_LIMIT_CURRENCY, 'ILS');
});

test('both bounds are inclusive', () => {
  assert.equal(checkoutAmountLimit(1).isBlocked, false);
  assert.equal(checkoutAmountLimit(1000).isBlocked, false);
});

test('a total inside the range passes', () => {
  const limit = checkoutAmountLimit(87.5);
  assert.equal(limit.status, 'allowed');
  assert.equal(limit.isBlocked, false);
  assert.equal(limit.messageKey, null);
  assert.equal(limit.total, 87.5);
});

/*
|--------------------------------------------------------------------------
| Out of range
|--------------------------------------------------------------------------
*/

test('under the minimum is blocked, and says which side', () => {
  const limit = checkoutAmountLimit(0.99);
  assert.equal(limit.status, 'below');
  assert.equal(limit.isBlocked, true);
  assert.equal(limit.messageKey, 'checkout.amountLimit.below');
  assert.equal(limit.total, 0.99);
});

test('over the maximum is blocked, and says which side', () => {
  const limit = checkoutAmountLimit(1000.01);
  assert.equal(limit.status, 'above');
  assert.equal(limit.isBlocked, true);
  assert.equal(limit.messageKey, 'checkout.amountLimit.above');
});

test('a zero total is below the minimum, not an unknown one', () => {
  assert.equal(checkoutAmountLimit(0).status, 'below');
});

test('the limits travel with the answer, so the message can name them', () => {
  const limit = checkoutAmountLimit(0.5);
  assert.equal(limit.min, MIN_CHECKOUT_TOTAL);
  assert.equal(limit.max, MAX_CHECKOUT_TOTAL);
  assert.equal(limit.currency, CHECKOUT_LIMIT_CURRENCY);
});

/*
|--------------------------------------------------------------------------
| Never block what cannot be judged
|--------------------------------------------------------------------------
| Every case here reaches the backend instead. A false block is a lost
| order; a missed one is caught server side.
*/

test('an unpriced cart passes — the server has not answered yet', () => {
  for (const total of [null, undefined, '']) {
    const limit = checkoutAmountLimit(total);
    assert.equal(limit.isBlocked, false, `total ${String(total)} must not block`);
    assert.equal(limit.total, null);
  }
});

test('a total that is not a number passes', () => {
  assert.equal(checkoutAmountLimit('abc').isBlocked, false);
  assert.equal(checkoutAmountLimit(Number.NaN).isBlocked, false);
  assert.equal(checkoutAmountLimit(Number.POSITIVE_INFINITY).isBlocked, false);
});

test('a total in another currency passes — the bounds are not ours to apply', () => {
  assert.equal(checkoutAmountLimit(0.5, 'USD').isBlocked, false);
  assert.equal(checkoutAmountLimit(5000, 'EUR').isBlocked, false);
});

test('a missing currency is the store default, and is judged', () => {
  assert.equal(checkoutAmountLimit(0.5, null).status, 'below');
  assert.equal(checkoutAmountLimit(0.5, '').status, 'below');
});

test('the currency is matched case-insensitively and untrimmed', () => {
  assert.equal(checkoutAmountLimit(0.5, ' ils ').status, 'below');
});

/*
|--------------------------------------------------------------------------
| No money arithmetic
|--------------------------------------------------------------------------
*/

test('a server string amount is judged, not reformatted', () => {
  assert.equal(checkoutAmountLimit('1.00').isBlocked, false);
  assert.equal(checkoutAmountLimit('0.50').status, 'below');
});

test('a float artifact is judged as the amount the customer is shown', () => {
  /* 1000.0000000000001 renders as ₪1000.00 — refusing it would refuse a
     total the customer can see is exactly at the limit. */
  assert.equal(checkoutAmountLimit(1000.0000000000001).isBlocked, false);
  assert.equal(checkoutAmountLimit(0.999999999999999).isBlocked, false);
  /* A cent past the bound is still a cent past it. */
  assert.equal(checkoutAmountLimit(1000.005).status, 'above');
});

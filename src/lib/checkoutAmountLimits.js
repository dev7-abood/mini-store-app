/*
|--------------------------------------------------------------------------
| Checkout Amount Limits
|--------------------------------------------------------------------------
| A checkout is accepted only for a total between 1 and 1,000 ILS. The
| BACKEND enforces that and stays the final word; this module states the
| same rule early, so the customer hears it before they pick a method,
| type their details, or — on a manual method — transfer real money by
| hand for an order that would then be refused.
|
| Two rules this module exists to keep.
|
| FIRST: no money arithmetic. The total judged here is the server's own
| figure, compared against the two bounds and never summed, scaled or
| adjusted — the same contract money.js holds every other amount to. The
| message therefore states the limits and the total, and never a computed
| shortfall.
|
| SECOND: an amount this module cannot judge NEVER blocks. An unpriced
| cart (the server has not answered yet, or the app is running with no
| backend at all) and a total in some other currency both come back
| `allowed`, and the request goes to the backend that owns the real
| answer. The client only ever blocks a total it is CERTAIN is out of
| range — a false block is a lost order, a missed one is caught server
| side.
*/
/* Extension included so the node test runner can load this module. */
import { currencyCode } from './money.js';

/** Inclusive bounds, in the currency below. */
export const MIN_CHECKOUT_TOTAL = 1;
export const MAX_CHECKOUT_TOTAL = 1000;

/** The currency the bounds are denominated in — the store's default. */
export const CHECKOUT_LIMIT_CURRENCY = 'ILS';

/**
 * @typedef {object} CheckoutAmountLimit
 * @property {'allowed'|'below'|'above'} status
 * @property {boolean} isBlocked   true only for a total certainly out of range
 * @property {string|null} messageKey  i18n key for the reason, null when allowed
 * @property {number|null} total   the judged total, null when there was none
 * @property {number} min
 * @property {number} max
 * @property {string} currency
 */

/** Allowed, with nothing to say about it. */
function allowed(total = null) {
  return {
    status: 'allowed',
    isBlocked: false,
    messageKey: null,
    total,
    min: MIN_CHECKOUT_TOTAL,
    max: MAX_CHECKOUT_TOTAL,
    currency: CHECKOUT_LIMIT_CURRENCY,
  };
}

/**
 * Snap to the 2 decimals every server amount already carries. Not a
 * re-price: it only stops a float artifact (7.799999999999999) from
 * reading as a different number than the 7.80 the customer is shown.
 *
 * @param {number} value
 */
function toDisplayedPrecision(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Judge one order total against the checkout bounds.
 *
 * @param {number|string|null|undefined} total the server's total for the
 *   cart or the payment preview — never a locally computed one
 * @param {string|null|undefined} [currency] the total's own currency; the
 *   store default is assumed when the payload carries none
 * @returns {CheckoutAmountLimit}
 */
export function checkoutAmountLimit(total, currency = null) {
  /* A currency we hold no bounds for is not ours to refuse. */
  const code = currencyCode(currency);
  if (code && code !== CHECKOUT_LIMIT_CURRENCY) return allowed(null);

  if (total === null || total === undefined || total === '') return allowed(null);
  const value = Number(total);
  if (!Number.isFinite(value)) return allowed(null);

  const amount = toDisplayedPrecision(value);

  if (amount < MIN_CHECKOUT_TOTAL) {
    return { ...allowed(amount), status: 'below', isBlocked: true, messageKey: 'checkout.amountLimit.below' };
  }
  if (amount > MAX_CHECKOUT_TOTAL) {
    return { ...allowed(amount), status: 'above', isBlocked: true, messageKey: 'checkout.amountLimit.above' };
  }
  return allowed(amount);
}

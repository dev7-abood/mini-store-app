/*
|--------------------------------------------------------------------------
| Manual Payment — confirmation check
|--------------------------------------------------------------------------
| A deliberate pause in front of "I have paid": one small sum the customer
| has to answer before the claim is sent. It exists to stop the reflex tap
| — the claim creates an order and pulls a cashier into verifying money
| that may never have moved.
|
| It is a UI gate and nothing else. Nothing here touches the amount that
| is charged, stored or displayed: `wholeAmount()` produces a number for
| the QUESTION only, and the real total keeps its decimals everywhere it
| is shown (see PaymentInstructions, which formats it to 2 decimals).
|
| The question is whole-number arithmetic on purpose. "55.50 + 3" invites
| a decimal answer and a dispute about the format; "56 + 3" has exactly
| one correct string of digits.
*/

/** Y is small so the sum stays mental arithmetic, never a puzzle. */
const MIN_ADDEND = 1;
const MAX_ADDEND = 9;

/**
 * The order total as a whole number, for the question only.
 *
 * The server sends money as a float/decimal (55, 55.5, "55.50"), and the
 * check has no use for the cents: they are rounded away here and nowhere
 * else. Returns null when there is no usable amount, which the caller
 * reads as "cannot ask a question about it".
 *
 * @param {number|string|null|undefined} amount
 * @returns {number|null} a non-negative integer, or null
 */
export function wholeAmount(amount) {
  if (amount === null || amount === undefined || amount === '') return null;
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/**
 * Build the question: X + Y, where X is the whole order total and Y is a
 * small random whole number.
 *
 * @param {number|string|null|undefined} amount the order total
 * @param {() => number} [random] injectable for the tests
 * @returns {{total: number, addend: number, answer: number}|null}
 *   null when the amount cannot carry a question — the caller then shows
 *   no check rather than one about a made-up figure.
 */
export function createPaymentCheck(amount, random = Math.random) {
  const total = wholeAmount(amount);
  if (total === null) return null;

  const span = MAX_ADDEND - MIN_ADDEND + 1;
  const addend = MIN_ADDEND + Math.floor(random() * span);

  return { total, addend, answer: total + addend };
}

/**
 * Is what the customer typed the answer?
 *
 * Strict on purpose: digits only, optionally signed, with surrounding
 * whitespace forgiven. "56.0" and "٥٦" are not accepted — the question
 * asked for a whole number and the field only offers a numeric keypad.
 *
 * @param {string} input the raw field value
 * @param {{answer: number}|null} check
 * @returns {boolean} false for an empty field, so a blank answer never
 *   passes as "nothing to check".
 */
export function isPaymentCheckAnswered(input, check) {
  if (!check) return false;

  const trimmed = String(input ?? '').trim();
  if (!/^-?\d+$/.test(trimmed)) return false;

  return Number(trimmed) === check.answer;
}

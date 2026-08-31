/*
|--------------------------------------------------------------------------
| Manual Payment — confirmation check
|--------------------------------------------------------------------------
| A deliberate pause in front of "I have paid": one small sum the customer
| has to answer before the claim is sent. It exists to stop the reflex tap
| — the claim creates an order and pulls a cashier into verifying money
| that may never have moved.
|
| It is a UI gate and nothing else. Nothing here reads or touches the
| amount that is charged, stored or displayed — the sum is two small
| random whole numbers, unrelated to the order.
|
| Deliberately kept small (0–20 a side, so never past 40). The point is a
| moment's attention, not arithmetic: a question built from the order
| total gave sums like "91 + 7", which reads as a hurdle rather than a
| prompt. Whole numbers throughout, so there is exactly one correct
| string of digits and no argument about decimal format.
*/

/** Inclusive bounds for BOTH sides of the sum. */
const MIN_OPERAND = 0;
const MAX_OPERAND = 20;

/**
 * One whole number in the operand range.
 *
 * @param {() => number} random
 * @returns {number}
 */
function operand(random) {
  const span = MAX_OPERAND - MIN_OPERAND + 1;
  return MIN_OPERAND + Math.floor(random() * span);
}

/**
 * Build the question: X + Y, both small whole numbers.
 *
 * @param {() => number} [random] injectable for the tests
 * @returns {{left: number, right: number, answer: number}}
 */
export function createPaymentCheck(random = Math.random) {
  const left = operand(random);
  const right = operand(random);

  return { left, right, answer: left + right };
}

/**
 * Is what the customer typed the answer?
 *
 * Strict on purpose: digits only, optionally signed, with surrounding
 * whitespace forgiven. "12.0" and "١٢" are not accepted — the question
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

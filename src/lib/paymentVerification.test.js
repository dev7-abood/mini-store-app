/*
 * The confirmation check in front of "I have paid".
 *
 * The rules under test: the sum stays small and whole, and it is never
 * built from the order amount.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentCheck, isPaymentCheckAnswered } from './paymentVerification.js';

/* Feeds Math.random() a fixed sequence, one value per operand. */
function sequence(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('createPaymentCheck asks X + Y and states the answer', () => {
  const check = createPaymentCheck(sequence(0, 0.5));

  assert.equal(check.left, 0);
  assert.equal(check.right, 10);
  assert.equal(check.answer, 10);
});

test('both operands are whole numbers within 0-20', () => {
  for (const r of [0, 0.01, 0.25, 0.5, 0.75, 0.999999]) {
    const { left, right, answer } = createPaymentCheck(() => r);

    for (const operand of [left, right]) {
      assert.equal(Number.isInteger(operand), true, `${operand} is not whole`);
      assert.ok(operand >= 0 && operand <= 20, `${operand} out of range`);
    }
    assert.equal(answer, left + right);
    assert.ok(answer <= 40, `${answer} is bigger than the sum can be`);
  }
});

test('a real random draw never leaves the range', () => {
  for (let i = 0; i < 500; i += 1) {
    const { left, right, answer } = createPaymentCheck();

    assert.ok(Number.isInteger(left) && left >= 0 && left <= 20);
    assert.ok(Number.isInteger(right) && right >= 0 && right <= 20);
    assert.equal(answer, left + right);
  }
});

test('the two sides are drawn independently', () => {
  const check = createPaymentCheck(sequence(0.999999, 0));

  assert.equal(check.left, 20);
  assert.equal(check.right, 0);
  assert.equal(check.answer, 20);
});

test('isPaymentCheckAnswered accepts only the exact whole answer', () => {
  const check = createPaymentCheck(sequence(0.5, 0.2)); // 10 + 4 = 14

  assert.equal(check.answer, 14);
  assert.equal(isPaymentCheckAnswered('14', check), true);
  assert.equal(isPaymentCheckAnswered('  14  ', check), true);
  assert.equal(isPaymentCheckAnswered('13', check), false);
  assert.equal(isPaymentCheckAnswered('15', check), false);
  assert.equal(isPaymentCheckAnswered('14.0', check), false);
  assert.equal(isPaymentCheckAnswered('١٤', check), false);
});

test('an empty or missing answer never passes', () => {
  const check = createPaymentCheck(sequence(0.5, 0.5));

  assert.equal(isPaymentCheckAnswered('', check), false);
  assert.equal(isPaymentCheckAnswered('   ', check), false);
  assert.equal(isPaymentCheckAnswered(null, check), false);
  assert.equal(isPaymentCheckAnswered(undefined, check), false);
});

test('no check means nothing has been answered', () => {
  assert.equal(isPaymentCheckAnswered('14', null), false);
});

/*
 * The confirmation check in front of "I have paid".
 *
 * The rule under test throughout: the question is whole numbers only,
 * and the real amount is never touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wholeAmount,
  createPaymentCheck,
  isPaymentCheckAnswered,
} from './paymentVerification.js';

test('wholeAmount drops the cents the server sent', () => {
  assert.equal(wholeAmount(55), 55);
  assert.equal(wholeAmount(55.0), 55);
  assert.equal(wholeAmount(55.5), 56);
  assert.equal(wholeAmount(55.49), 55);
  assert.equal(wholeAmount('55.50'), 56);
  assert.equal(wholeAmount(0), 0);
});

test('wholeAmount returns null when there is nothing to ask about', () => {
  assert.equal(wholeAmount(null), null);
  assert.equal(wholeAmount(undefined), null);
  assert.equal(wholeAmount(''), null);
  assert.equal(wholeAmount('abc'), null);
  assert.equal(wholeAmount(Number.NaN), null);
  assert.equal(wholeAmount(-1), null);
});

test('createPaymentCheck asks X + Y with whole numbers only', () => {
  const check = createPaymentCheck(55.5, () => 0.5);

  assert.equal(Number.isInteger(check.total), true);
  assert.equal(Number.isInteger(check.addend), true);
  assert.equal(check.total, 56);
  assert.equal(check.answer, check.total + check.addend);
});

test('createPaymentCheck keeps Y a small non-zero whole number', () => {
  for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
    const { addend } = createPaymentCheck(20, () => r);
    assert.equal(Number.isInteger(addend), true);
    assert.ok(addend >= 1 && addend <= 9, `addend ${addend} out of range`);
  }
});

test('createPaymentCheck returns null when the total is unknown', () => {
  assert.equal(createPaymentCheck(null), null);
  assert.equal(createPaymentCheck('—'), null);
});

test('isPaymentCheckAnswered accepts only the exact whole answer', () => {
  const check = createPaymentCheck(55.5, () => 0); // 56 + 1 = 57

  assert.equal(isPaymentCheckAnswered('57', check), true);
  assert.equal(isPaymentCheckAnswered('  57  ', check), true);
  assert.equal(isPaymentCheckAnswered('56', check), false);
  assert.equal(isPaymentCheckAnswered('58', check), false);
  assert.equal(isPaymentCheckAnswered('57.0', check), false);
  assert.equal(isPaymentCheckAnswered('٥٧', check), false);
});

test('an empty or missing answer never passes', () => {
  const check = createPaymentCheck(10, () => 0);

  assert.equal(isPaymentCheckAnswered('', check), false);
  assert.equal(isPaymentCheckAnswered('   ', check), false);
  assert.equal(isPaymentCheckAnswered(null, check), false);
  assert.equal(isPaymentCheckAnswered(undefined, check), false);
});

test('no check means nothing has been answered', () => {
  assert.equal(isPaymentCheckAnswered('57', null), false);
});

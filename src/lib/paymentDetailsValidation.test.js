/*
 * The checkout form's own rules — the ones the customer sees before any
 * request leaves the app.
 *
 * The rule under test throughout: a delivery name is at least two words.
 * A first name alone cannot be asked for at a door, and the Telegram
 * handle is never allowed to stand in for one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_FULL_NAME_WORDS,
  fullNameWords,
  normalizeFullName,
  validatePaymentDetails,
} from './paymentDetailsValidation.js';
import { buildJawwalPayCheckoutPayload } from './jawwalPayCheckout.js';

/* Stand-in for i18next: the key itself is the message, so a test asserts
   WHICH rule fired rather than the wording of the day. */
const t = (key) => key;

const VALID = {
  fullName: 'عبدالرحمن حسن',
  phone: '598 304 517',
  address: 'غزة، شارع عمر المختار، بناية 5',
};

const validate = (patch = {}) => validatePaymentDetails({ ...VALID, ...patch }, t);

/*
|--------------------------------------------------------------------------
| Word count
|--------------------------------------------------------------------------
*/

test('two words is the floor', () => {
  assert.equal(MIN_FULL_NAME_WORDS, 2);
});

test('a single-word name is invalid', () => {
  for (const fullName of ['عبدالرحمن', 'Abdulrahman', '   Abdulrahman   ']) {
    const result = validate({ fullName });
    assert.equal(result.isValid, false, fullName);
    assert.equal(result.errors.fullName, 'paymentDetails.errors.fullNameWords');
  }
});

test('two words passes, and so does more', () => {
  for (const fullName of [
    'عبدالرحمن حسن',
    'Abdulrahman Hassan',
    'Abdulrahman Hassan Al Masri',
    'عبد الرحمن حسن المصري',
  ]) {
    const result = validate({ fullName });
    assert.equal(result.isValid, true, fullName);
    assert.equal(result.errors.fullName, undefined);
  }
});

test('padding is not a second word', () => {
  /* A trailing space, a non-breaking space, or a zero-width joiner must
     not buy a word — Arabic keyboards emit the last two freely. */
  assert.equal(validate({ fullName: 'Abdulrahman ' }).isValid, false);
  assert.equal(validate({ fullName: 'Abdulrahman ' }).isValid, false);
  assert.equal(validate({ fullName: 'Abdulrahman​Hassan' }).isValid, false);
  assert.equal(validate({ fullName: 'Abdulrahman Hassan' }).isValid, true);
});

/*
|--------------------------------------------------------------------------
| The other name rules still stand
|--------------------------------------------------------------------------
| The word count is an ADDITION: an empty name is still "required", and a
| too-short one is still "short". Each rule keeps its own message so the
| field says the one thing that is actually wrong.
*/

test('an empty name is still required, not word-counted', () => {
  const result = validate({ fullName: '   ' });
  assert.equal(result.errors.fullName, 'paymentDetails.errors.fullNameRequired');
});

test('a too-short name still reports its length', () => {
  const result = validate({ fullName: 'ab' });
  assert.equal(result.errors.fullName, 'paymentDetails.errors.fullNameShort');
});

test('the phone and address rules are untouched', () => {
  assert.equal(validate({ phone: '' }).errors.phone, 'paymentDetails.errors.phoneRequired');
  assert.equal(validate({ phone: '412 000 000' }).errors.phone, 'paymentDetails.errors.phoneInvalid');
  assert.equal(validate({ address: '' }).errors.address, 'paymentDetails.errors.addressRequired');
  assert.equal(validate({ address: 'abc' }).errors.address, 'paymentDetails.errors.addressShort');
});

/*
|--------------------------------------------------------------------------
| Normalization
|--------------------------------------------------------------------------
| The name the form validates is the name the payload carries — collapsed
| identically on both sides, so the server counts the same words.
*/

test('whitespace collapses to single spaces', () => {
  assert.equal(normalizeFullName('  Abdulrahman \n\t Hassan  '), 'Abdulrahman Hassan');
  assert.equal(normalizeFullName(null), '');
  assert.equal(normalizeFullName(undefined), '');
});

test('the validated value is the normalized name', () => {
  const result = validate({ fullName: '  عبدالرحمن   حسن  ' });
  assert.equal(result.isValid, true);
  assert.equal(result.value.fullName, 'عبدالرحمن حسن');
  assert.deepEqual(fullNameWords(result.value.fullName), ['عبدالرحمن', 'حسن']);
});

/*
|--------------------------------------------------------------------------
| What reaches the API
|--------------------------------------------------------------------------
*/

test('the checkout payload carries the typed name and no handle', () => {
  const payload = buildJawwalPayCheckoutPayload({
    name: 'عبدالرحمن حسن',
    phone: '+970598304517',
    address: 'غزة',
    paymentMethod: 'jawwalpay',
  });

  assert.equal(payload.name, 'عبدالرحمن حسن');
  /* The Telegram handle rides on the signed initData, never in the body. */
  assert.equal('username' in payload, false);
  assert.equal('telegram_username' in payload, false);
});

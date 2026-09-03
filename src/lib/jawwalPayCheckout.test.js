import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  JAWWAL_PAY_OTP_LENGTH,
  apiPathFromConfirmationUrl,
  buildJawwalPayConfirmationRequest,
  buildJawwalPayCheckoutPayload,
  createSingleFlightSubmitter,
  isCompleteJawwalPayOtp,
  normalizeJawwalPayOtpSession,
  resolveJawwalPayConfirmationOutcome,
  shouldOpenJawwalPayOtp,
  shouldPollWhileAwaitingJawwalPayOtp,
} from './jawwalPayCheckout.js';

const checkoutPayload = buildJawwalPayCheckoutPayload({
  name: 'Customer Name',
  phone: '+970599002286',
  deliveryPhone: null,
  address: 'Customer address',
  paymentMethod: 'jawwalpay',
  note: null,
});

const otpData = {
  payment: {
    status: 'awaiting_approval',
    notified_phone: '+970599002286',
    expires_in: 300,
    requires_otp: true,
    otp_length: 5,
    payment_session_id: 123,
    next_action: 'confirm_jawwal_pay_checkout',
    should_poll: false,
    checkout_completed: false,
  },
  confirmation_url: '/api/v1/checkout/jawwal-pay/confirm',
};

test('Jawwal Pay checkout opens the OTP step after HTTP 202', () => {
  const result = {
    ok: true,
    status: 202,
    message: 'A verification code was sent by Jawwal Pay.',
    data: otpData,
  };

  assert.equal(shouldOpenJawwalPayOtp(result, checkoutPayload), true);

  const session = normalizeJawwalPayOtpSession(result.data, checkoutPayload, 1000);
  assert.equal(session.paymentSessionId, 123);
  assert.equal(session.notifiedPhone, '+970599002286');
  assert.equal(session.otpLength, JAWWAL_PAY_OTP_LENGTH);
  assert.equal(session.expiresAt, 301000);
});

test('exactly five normalized digits are required', () => {
  assert.equal(isCompleteJawwalPayOtp('1234'), false);
  assert.equal(isCompleteJawwalPayOtp('12345'), true);
  assert.equal(isCompleteJawwalPayOtp('123456'), false);
  assert.equal(isCompleteJawwalPayOtp('١٢٣٤٥'), true);
  assert.equal(isCompleteJawwalPayOtp('۱۲۳۴۵'), true);

  const session = normalizeJawwalPayOtpSession(otpData, checkoutPayload);
  assert.throws(
    () => buildJawwalPayConfirmationRequest(session, '1234'),
    /exactly 5 digits/,
  );
});

test('OTP confirmation uses confirmation_url, payment_session_id, and original fields', () => {
  const session = normalizeJawwalPayOtpSession(otpData, checkoutPayload);
  const request = buildJawwalPayConfirmationRequest(session, '١٢٣٤٥');

  assert.equal(request.url, '/api/v1/checkout/jawwal-pay/confirm');
  assert.equal(apiPathFromConfirmationUrl(request.url), '/checkout/jawwal-pay/confirm');
  assert.deepEqual(request.payload, {
    name: 'Customer Name',
    phone: '+970599002286',
    delivery_phone: null,
    address: 'Customer address',
    payment_method: 'jawwalpay',
    note: null,
    payment_session_id: 123,
    code: '12345',
  });
});

test('invalid OTP stays on the OTP screen and keeps the session', () => {
  const outcome = resolveJawwalPayConfirmationOutcome({
    ok: false,
    status: 422,
    message: 'Invalid OTP',
    error: {
      provider: 'jawwal_pay',
      code: '89',
      reference: 'ref-1',
      description: 'Invalid OTP',
    },
  });

  assert.equal(outcome.action, 'stay_on_otp');
  assert.equal(outcome.keepSession, true);
  assert.equal(outcome.clearOtp, true);
  assert.equal(outcome.invalidOtp, true);
});

test('successful MFP redirects only when checkout_completed is true', () => {
  const incomplete = resolveJawwalPayConfirmationOutcome({
    ok: true,
    status: 201,
    data: {
      payment: { status: 'paid', requires_otp: false, checkout_completed: false },
      redirect_url: '/orders/SF-1',
    },
  });

  assert.equal(incomplete.action, 'stay_on_otp');
  assert.equal(incomplete.keepSession, true);

  const complete = resolveJawwalPayConfirmationOutcome({
    ok: true,
    status: 201,
    message: 'Payment completed successfully.',
    data: {
      order: { id: 77, order_number: 'SF-77' },
      payment: { status: 'paid', requires_otp: false, checkout_completed: true },
      redirect_url: '/orders/SF-77',
    },
  });

  assert.equal(complete.action, 'redirect');
  assert.equal(complete.redirectUrl, '/orders/SF-77');
  assert.equal(complete.keepSession, false);
});

test('duplicate confirmation submits are prevented', async () => {
  let calls = 0;
  let release;
  const submit = createSingleFlightSubmitter(async () => {
    calls += 1;
    await new Promise((resolve) => {
      release = resolve;
    });
    return { ok: true };
  });

  const first = submit();
  const second = await submit();
  assert.deepEqual(second, { ok: false, duplicate: true });
  assert.equal(calls, 1);

  release();
  assert.deepEqual(await first, { ok: true });

  const third = submit();
  release();
  assert.deepEqual(await third, { ok: true });
  assert.equal(calls, 2);
});

test('payment-status polling is disabled while Jawwal Pay OTP is required', () => {
  const session = normalizeJawwalPayOtpSession(otpData, checkoutPayload);

  assert.equal(session.shouldPoll, false);
  assert.equal(shouldPollWhileAwaitingJawwalPayOtp(session), false);
});

test('development OTP text is not displayed in frontend locales or OTP screen', () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const files = [
    join(root, 'i18n', 'locales', 'ar.json'),
    join(root, 'i18n', 'locales', 'en.json'),
    join(root, 'screens', 'OtpScreen.jsx'),
  ];

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.equal(text.includes('00000'), false, file);
    assert.equal(/development OTP|test OTP|وضع تجريبي/i.test(text), false, file);
  }
});

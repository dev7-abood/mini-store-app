/*
 * Drives the normalizers with the REAL captures from the API brief and
 * asserts the decisions the UI makes from them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePayment,
  pollDelayMs,
  isLtrValue,
  accountFieldText,
  enumText,
} from './payment.js';
import { normalizePaymentMethods } from './paymentMethods.js';
import {
  JAWWAL_PAY_OTP_LENGTH,
  buildJawwalPayCheckoutPayload,
  normalizeJawwalPayOtpSession,
  shouldOpenJawwalPayOtp,
} from './jawwalPayCheckout.js';

/* Stand-in for i18next: resolves a flat catalog, honours defaultValue. */
const CATALOG = {
  'payment.status.awaiting_transfer': 'بانتظار التحويل',
  'payment.status.paid': 'مدفوع',
  'payment.settlement.peer': 'تحويل يدوي',
  'payment.settlement.smart': 'دفع إلكتروني',
  'payment.source.manual': 'تم التأكيد من المتجر',
  'payment.field.wallet_number': 'رقم محفظة الهاتف',
  'payment.field.iban': 'IBAN',
};
const t = (key, opts = {}) => CATALOG[key] ?? opts.defaultValue ?? key;

const METHODS = {
  success: true,
  data: {
    methods: [
      {
        method: 'palpay',
        label: 'PalPay',
        settlement: 'peer',
        settlement_label: 'Manual transfer',
        is_automatic: false,
        account: {
          rows: [
            { field: 'account_holder', value: 'Main Branch Ltd', copyable: false },
            { field: 'wallet_number', value: '0599123456', copyable: true },
            { field: 'bank_name', value: 'PalPay', copyable: false },
          ],
          note: 'Send the order number as the transfer reference.',
        },
      },
      {
        method: 'jawwalpay',
        label: 'JawwalPay',
        settlement: 'smart',
        settlement_label: 'Online payment',
        is_automatic: true,
      },
    ],
    has_methods: true,
  },
};

const AT_CHECKOUT = {
  method: 'palpay', method_label: 'PalPay', status: 'pending',
  status_label: 'Not started',
  description: 'The payment request has not been sent yet.',
  notified_phone: null, failure_reason: null, expires_in: null,
  attempts_remaining: 3, should_poll: false, is_retryable: false,
  is_paid: false, paid_at: null, checkout_completed: false,
  settlement: 'peer', settlement_label: 'Manual transfer',
  requires_confirmation: true, awaiting_confirmation: false,
  confirmation: {
    source: null, source_label: null, is_manual: false, is_automatic: false,
    confirmed_at: null, confirmed_by: null, note: null,
  },
  instructions: null,
};

const INSTRUCTIONS = {
  settlement: 'peer', method: 'palpay', method_label: 'PalPay',
  rows: [
    { field: 'account_holder', value: 'Main Branch Ltd', copyable: false },
    { field: 'wallet_number', value: '0599123456', copyable: true },
    { field: 'bank_name', value: 'PalPay', copyable: false },
  ],
  amount: 150, currency: 'ILS', reference: 'ORD-260830-IP7G8',
  note: 'Send the order number as the transfer reference.',
};

const STATE_A = {
  status: 'awaiting_transfer', status_label: 'Awaiting transfer',
  description: 'Transfer the amount…', reference: 'ORD-260830-IP7G8',
  failure_reason: null, is_paid: false, is_final: false, should_poll: false,
  is_retryable: false, checkout_completed: false, method: 'palpay',
  method_label: 'PalPay', notified_phone: null, expires_in: null,
  attempts_remaining: 2, paid_at: null, poll_after: 3,
  settlement: 'peer', settlement_label: 'Manual transfer',
  requires_confirmation: true, awaiting_confirmation: true,
  confirmation: {
    source: null, source_label: null, is_manual: false, is_automatic: false,
    confirmed_at: null, confirmed_by: null, note: null,
  },
  instructions: INSTRUCTIONS,
};

const STATE_B = {
  ...STATE_A,
  status: 'paid', status_label: 'Paid', description: 'Payment received.',
  is_paid: true, is_final: true, checkout_completed: true,
  paid_at: '2026-08-30T17:10:33+03:00', awaiting_confirmation: false,
  confirmation: {
    source: 'manual', source_label: 'Confirmed by the store',
    is_manual: true, is_automatic: false,
    confirmed_at: '2026-08-30T17:10:33+03:00',
    confirmed_by: 'Sami Odeh', note: 'Cash at till, receipt 8841',
  },
};

const STATE_C = {
  method: 'jawwalpay', method_label: 'JawwalPay', status: 'paid',
  status_label: 'Paid', is_paid: true, paid_at: '2026-08-30T17:10:33+03:00',
  checkout_completed: true, settlement: 'smart',
  settlement_label: 'Online payment', requires_confirmation: false,
  awaiting_confirmation: false,
  confirmation: {
    source: 'automatic', source_label: 'Confirmed automatically',
    is_manual: false, is_automatic: true,
    confirmed_at: '2026-08-30T17:10:33+03:00', confirmed_by: null, note: null,
  },
  instructions: null,
};

test('method chooser reads settlement, not the method name', () => {
  const [palpay, jawwal] = normalizePaymentMethods(METHODS);
  assert.equal(palpay.settlement, 'peer');
  assert.equal(palpay.isAutomatic, false);
  assert.equal(palpay.account.rows.length, 3);
  assert.equal(palpay.account.rows[1].copyable, true);
  assert.equal(jawwal.isAutomatic, true);
  assert.equal(jawwal.account, null, 'a smart method carries no account');
});

test('no methods means the store cannot take payment', () => {
  assert.deepEqual(normalizePaymentMethods({ data: { methods: [] } }), []);
  assert.deepEqual(normalizePaymentMethods(null), []);
});

test('at checkout the waiting banner must stay hidden', () => {
  const p = normalizePayment(AT_CHECKOUT);
  assert.equal(p.requiresConfirmation, true);
  assert.equal(p.awaitingConfirmation, false, 'phone not verified yet');
  assert.equal(p.instructions, null);
  assert.equal(p.shouldPoll, false);
});

test('state A: awaiting the store, never polled', () => {
  const p = normalizePayment(STATE_A);
  assert.equal(p.awaitingConfirmation, true);
  assert.equal(p.isPaid, false);
  assert.equal(p.shouldPoll, false, 'a manual payment is never polled');
  assert.equal(p.expiresIn, null, 'so no countdown can render');
  assert.equal(p.reference, 'ORD-260830-IP7G8');
  assert.equal(p.instructions.amount, 150);
  assert.equal(p.instructions.currency, 'ILS');
  assert.deepEqual(
    p.instructions.rows.map((r) => r.field),
    ['account_holder', 'wallet_number', 'bank_name'],
    'rendered in the order the API returned',
  );
});

test('state B: the cashier confirmed it', () => {
  const p = normalizePayment(STATE_B);
  assert.equal(p.isPaid, true);
  assert.equal(p.awaitingConfirmation, false);
  assert.equal(p.confirmation.isManual, true);
  assert.equal(p.confirmation.confirmedBy, 'Sami Odeh');
  assert.equal(p.confirmation.note, 'Cash at till, receipt 8841');
  assert.ok(p.instructions, 'instructions survive as the receipt');
});

test('state C: the gateway paid it, no manual UI', () => {
  const p = normalizePayment(STATE_C);
  assert.equal(p.requiresConfirmation, false);
  assert.equal(p.awaitingConfirmation, false);
  assert.equal(p.confirmation.isAutomatic, true);
  assert.equal(p.confirmation.confirmedBy, null, 'no person decided it');
  assert.equal(p.instructions, null);
});

test('checkout_completed alone still means paid', () => {
  assert.equal(normalizePayment({ checkout_completed: true }).isPaid, true);
});

test('poll_after is ignored unless the server asks for polling', () => {
  const manual = normalizePayment(STATE_A);
  assert.equal(manual.pollAfter, 3, 'the field is read…');
  assert.equal(manual.shouldPoll, false, '…but nothing may start a timer');
  assert.equal(pollDelayMs({ pollAfter: 5, shouldPoll: true }), 5000);
  assert.equal(pollDelayMs(null), 3000);
});

test('labels come from the enum, not the API English', () => {
  const p = normalizePayment(STATE_A);
  assert.equal(enumText(t, 'payment.status', p.status, p.statusLabel), 'بانتظار التحويل');
  assert.equal(enumText(t, 'payment.settlement', p.settlement, p.settlementLabel), 'تحويل يدوي');
  assert.equal(accountFieldText(t, 'wallet_number'), 'رقم محفظة الهاتف');
});

test('an unknown enum falls back to the API label rather than vanishing', () => {
  assert.equal(enumText(t, 'payment.status', 'settling', 'Settling'), 'Settling');
  assert.equal(accountFieldText(t, 'swift_code'), 'swift code');
});

test('numbers stay LTR, names do not', () => {
  assert.equal(isLtrValue('PS92PALS000000000400123456789'), true);
  assert.equal(isLtrValue('0599123456'), true);
  assert.equal(isLtrValue('ORD-260830-IP7G8'), true);
  assert.equal(isLtrValue('Main Branch Ltd'), false);
  assert.equal(isLtrValue('فرع رام الله 2'), false);
});

/*
 * The smart path, unchanged by the manual-payment work: JawwalPay still
 * opens its in-app OTP, still polls, and still shows no manual UI. The
 * OTP session is decided by `requires_otp`, never by the method name, so
 * a manual checkout response must not open one.
 */
test('a smart checkout response still opens the JawwalPay OTP session', () => {
  const response = {
    order: { order_number: 'ORD-260830-AAAA' },
    payment: {
      method: 'jawwalpay',
      status: 'awaiting_approval',
      requires_otp: true,
      otp_length: 6,
      payment_session_id: 'sess-1',
      notified_phone: '+9705••••0111',
      expires_in: 120,
      should_poll: true,
      poll_after: 3,
      checkout_completed: false,
    },
  };

  const session = normalizeJawwalPayOtpSession(response, { phone: '+970598304517' });
  assert.ok(session, 'the OTP screen is reached');
  assert.equal(session.paymentSessionId, 'sess-1');
  assert.equal(session.otpLength, JAWWAL_PAY_OTP_LENGTH);
  assert.equal(session.expiresIn, 120, 'its own countdown, not payment.expires_in');
  assert.equal(shouldOpenJawwalPayOtp(response, {}), true);
});

test('a manual checkout response opens no OTP session', () => {
  const response = { order: { order_number: 'ORD-260830-IP7G8' }, payment: AT_CHECKOUT };
  assert.equal(normalizeJawwalPayOtpSession(response, {}), null);
  assert.equal(shouldOpenJawwalPayOtp(response, {}), false);
});

test('a smart payment in flight still polls, on the server cadence', () => {
  const p = normalizePayment({
    method: 'jawwalpay', status: 'awaiting_approval',
    status_label: 'Awaiting approval', settlement: 'smart',
    settlement_label: 'Online payment', requires_confirmation: false,
    awaiting_confirmation: false, should_poll: true, poll_after: 3,
    expires_in: 120, attempts_remaining: 3, is_paid: false,
    checkout_completed: false, instructions: null,
    confirmation: { source: null, is_manual: false, is_automatic: false },
  });

  assert.equal(p.shouldPoll, true, 'the smart flow keeps polling');
  assert.equal(pollDelayMs(p), 3000);
  assert.equal(p.requiresConfirmation, false, 'no human is ever in this loop');
  assert.equal(p.awaitingConfirmation, false, 'so no waiting banner');
  assert.equal(p.instructions, null, 'and no transfer screen');
  assert.equal(p.expiresIn, 120, 'a smart payment DOES expire');
});

test('the checkout payload carries whichever method was chosen', () => {
  const smart = buildJawwalPayCheckoutPayload({
    phone: '+970598304517', address: 'Ramallah', paymentMethod: 'jawwalpay',
  });
  const manual = buildJawwalPayCheckoutPayload({
    phone: '+970598304517', address: 'Ramallah', paymentMethod: 'palpay',
  });

  assert.equal(smart.payment_method, 'jawwalpay');
  assert.equal(manual.payment_method, 'palpay');
  assert.deepEqual(
    Object.keys(smart).sort(),
    Object.keys(manual).sort(),
    'one checkout body shape for every method',
  );
});

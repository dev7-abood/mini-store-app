/*
 * Drives the normalizers with the REAL captures from the API brief and
 * asserts the decisions the UI makes from them.
 *
 * The rule under test throughout: a customer's claim is not a payment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePayment,
  normalizeManualPaymentPreview,
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
  'payment.status.pending_verification': 'بانتظار تأكيد المتجر',
  'payment.status.rejected': 'لم يتم تأكيد الدفع',
  'payment.status.paid': 'مدفوع',
  'payment.settlement.peer': 'تحويل يدوي',
  'payment.settlement.smart': 'دفع إلكتروني',
  'payment.source.manual': 'تم التأكيد من المتجر',
  'payment.field.wallet_number': 'رقم محفظة الهاتف',
  'payment.field.iban': 'IBAN',
};
const t = (key, opts = {}) => CATALOG[key] ?? opts.defaultValue ?? key;

const ROWS = [
  { field: 'account_holder', value: 'Main Branch Ltd', copyable: false },
  { field: 'wallet_number', value: '0599123456', copyable: true },
  { field: 'bank_name', value: 'PalPay', copyable: false },
];

const METHODS = {
  success: true,
  data: {
    methods: [
      {
        method: 'jawwalpay',
        label: 'JawwalPay',
        settlement: 'smart',
        settlement_label: 'Online payment',
        is_automatic: true,
      },
      {
        method: 'palpay',
        label: 'PalPay',
        settlement: 'peer',
        settlement_label: 'Manual transfer',
        is_automatic: false,
        account: { rows: ROWS, note: 'Send the order number as the transfer reference.' },
      },
    ],
    has_methods: true,
  },
};

/* GET /manual-payment/{method} — no order exists yet. */
const PREVIEW = {
  success: true,
  data: {
    instructions: {
      settlement: 'peer',
      method: 'palpay',
      method_label: 'PalPay',
      rows: ROWS,
      amount: 90,
      currency: 'ILS',
      reference: null,
      note: 'Send the order number as the transfer reference.',
    },
    flow: {
      requires_manual_payment: true,
      confirmation_required: true,
      confirm_url: '/api/v1/checkout',
      creates_order_on_confirm: true,
      payment_status_after_confirm: 'pending_verification',
    },
    totals: {
      subtotal: 90, discount_total: 0, delivery_fee: 0, total: 90, currency: 'ILS',
    },
  },
};

const INSTRUCTIONS = {
  settlement: 'peer', method: 'palpay', method_label: 'PalPay',
  rows: ROWS, amount: 90, currency: 'ILS',
  reference: 'ORD-260830-UISXJ',
  note: 'Send the order number as the transfer reference.',
};

/* POST /checkout 201 — the claim. Order created, payment NOT made. */
const CLAIMED = {
  method: 'palpay', method_label: 'PalPay',
  status: 'pending_verification',
  status_label: 'Awaiting store verification',
  description: 'Thanks — we have told the store you paid.',
  failure_reason: null, expires_in: null, attempts_remaining: 2,
  should_poll: false, is_retryable: false,
  is_paid: false, paid_at: null, checkout_completed: false,
  settlement: 'peer', settlement_label: 'Manual transfer',
  requires_confirmation: true, awaiting_confirmation: true,
  claim: {
    claimed: true, claimed_at: '2026-08-30T18:05:01+03:00',
    is_verified: false, is_rejected: false,
  },
  confirmation: {
    source: null, source_label: null, is_manual: false, is_automatic: false,
    confirmed_at: null, confirmed_by: null, note: null,
  },
  rejection: { rejected: false, rejected_at: null, rejected_by: null, reason: null },
  reminder: { available: true, cooldown_seconds: 0, sent_count: 0, last_sent_at: null },
  instructions: INSTRUCTIONS,
};

const REJECTED = {
  ...CLAIMED,
  status: 'rejected',
  status_label: 'Payment not confirmed',
  description: 'The store could not find your payment.',
  failure_reason: 'No transfer found under that reference.',
  is_paid: false, is_retryable: false, awaiting_confirmation: false,
  claim: {
    claimed: true, claimed_at: '2026-08-30T18:05:01+03:00',
    is_verified: false, is_rejected: true,
  },
  rejection: {
    rejected: true,
    rejected_at: '2026-08-30T18:05:01+03:00',
    rejected_by: 'Sami Odeh',
    reason: 'No transfer found under that reference.',
  },
  reminder: {
    available: false, cooldown_seconds: 899, sent_count: 1,
    last_sent_at: '2026-08-30T18:05:01+03:00',
  },
};

const APPROVED = {
  ...CLAIMED,
  status: 'paid', status_label: 'Paid', description: 'Payment received.',
  is_paid: true, paid_at: '2026-08-30T18:05:01+03:00', checkout_completed: true,
  awaiting_confirmation: false,
  claim: {
    claimed: true, claimed_at: '2026-08-30T18:05:01+03:00',
    is_verified: true, is_rejected: false,
  },
  confirmation: {
    source: 'manual', source_label: 'Confirmed by the store',
    is_manual: true, is_automatic: false,
    confirmed_at: '2026-08-30T18:05:01+03:00',
    confirmed_by: 'Sami Odeh', note: 'Cash at till, receipt 8841',
  },
};

/* Smart, auto-paid — unchanged behaviour, plus the new descriptive keys. */
const SMART_PAID = {
  method: 'jawwalpay', method_label: 'JawwalPay', status: 'paid',
  status_label: 'Paid', description: 'Payment received.',
  notified_phone: null, failure_reason: null, expires_in: null,
  attempts_remaining: 3, should_poll: false, is_retryable: false,
  is_paid: true, paid_at: '2026-08-30T18:08:47+03:00', checkout_completed: true,
  settlement: 'smart', settlement_label: 'Online payment',
  requires_confirmation: false, awaiting_confirmation: false,
  claim: { claimed: false, claimed_at: null, is_verified: true, is_rejected: false },
  confirmation: {
    source: 'automatic', source_label: 'Confirmed automatically',
    is_manual: false, is_automatic: true,
    confirmed_at: '2026-08-30T18:08:47+03:00', confirmed_by: null, note: null,
  },
  rejection: { rejected: false, rejected_at: null, rejected_by: null, reason: null },
  reminder: { available: false, cooldown_seconds: 0, sent_count: 0, last_sent_at: null },
  instructions: null,
};

test('method chooser reads settlement, not the method name', () => {
  const [jawwal, palpay] = normalizePaymentMethods(METHODS);
  assert.equal(jawwal.isAutomatic, true);
  assert.equal(jawwal.account, null, 'a smart method has nothing to pay into');
  assert.equal(palpay.settlement, 'peer');
  assert.equal(palpay.isAutomatic, false);
  assert.equal(palpay.account.rows.length, 3);
  assert.equal(palpay.account.rows[1].copyable, true);
});

test('no methods means the store cannot take payment', () => {
  assert.deepEqual(normalizePaymentMethods({ data: { methods: [] } }), []);
  assert.deepEqual(normalizePaymentMethods(null), []);
});

test('the pay-from screen exists before any order does', () => {
  const preview = normalizeManualPaymentPreview(PREVIEW);
  assert.equal(preview.instructions.amount, 90);
  assert.equal(preview.instructions.currency, 'ILS');
  assert.equal(preview.instructions.reference, null, 'no order number yet');
  assert.deepEqual(
    preview.instructions.rows.map((r) => r.field),
    ['account_holder', 'wallet_number', 'bank_name'],
    'rendered in the order the API returned',
  );
  assert.equal(preview.flow.createsOrderOnConfirm, true);
  assert.equal(preview.flow.paymentStatusAfterConfirm, 'pending_verification');
  assert.equal(preview.totals.total, 90);
});

test('THE RULE: a claim is not a payment', () => {
  const p = normalizePayment(CLAIMED);
  assert.equal(p.claim.claimed, true, 'the customer said they paid');
  assert.equal(p.claim.isVerified, false, 'the store has not agreed');
  assert.equal(p.isPaid, false, 'so it is NOT paid');
  assert.equal(p.checkoutCompleted ?? p.isPaid, false);
  assert.equal(p.awaitingConfirmation, true, 'and the waiting banner shows');
  assert.equal(p.status, 'pending_verification');
});

test('a claimed payment is never polled and never expires', () => {
  const p = normalizePayment(CLAIMED);
  assert.equal(p.shouldPoll, false, 'a cashier resolves this, not a timer');
  assert.equal(p.expiresIn, null, 'so no countdown can render');
  assert.equal(p.reference, 'ORD-260830-UISXJ', 'the real order number now');
  assert.equal(p.reminder.available, true);
  assert.equal(p.reminder.cooldownSeconds, 0);
});

test('rejected: the store refused the money, not the order', () => {
  const p = normalizePayment(REJECTED);
  assert.equal(p.claim.isRejected, true);
  assert.equal(p.rejection.rejected, true);
  assert.equal(p.rejection.reason, 'No transfer found under that reference.');
  assert.equal(p.rejection.rejectedBy, 'Sami Odeh');
  assert.equal(p.isPaid, false);
  assert.equal(p.awaitingConfirmation, false, 'nobody is checking any more');
  assert.equal(p.isRetryable, false, 'and re-claiming is not offered');
  assert.ok(p.instructions, 'kept so they can re-check what they paid');
  assert.equal(p.reminder.available, false);
  assert.equal(p.reminder.cooldownSeconds, 899);
});

test('approved: a person verified it, and is named', () => {
  const p = normalizePayment(APPROVED);
  assert.equal(p.isPaid, true);
  assert.equal(p.claim.isVerified, true, 'is_verified tracks is_paid');
  assert.equal(p.awaitingConfirmation, false);
  assert.equal(p.confirmation.isManual, true);
  assert.equal(p.confirmation.confirmedBy, 'Sami Odeh');
  assert.equal(p.confirmation.note, 'Cash at till, receipt 8841');
  assert.ok(p.instructions, 'still present, as the receipt');
});

test('smart: settles itself, claims nothing, shows no manual UI', () => {
  const p = normalizePayment(SMART_PAID);
  assert.equal(p.requiresConfirmation, false);
  assert.equal(p.awaitingConfirmation, false);
  assert.equal(p.claim.claimed, false, 'nobody claimed anything');
  assert.equal(p.claim.isVerified, true, 'the gateway settled it');
  assert.equal(p.confirmation.isAutomatic, true);
  assert.equal(p.confirmation.confirmedBy, null, 'no person decided it');
  assert.equal(p.rejection.rejected, false);
  assert.equal(p.reminder.available, false);
  assert.equal(p.instructions, null);
});

test('claim, rejection and reminder are always objects, never missing', () => {
  /* Nothing may test for the KEY; the booleans inside are the contract. */
  const bare = normalizePayment({ status: 'pending' });
  assert.equal(bare.claim.claimed, false);
  assert.equal(bare.rejection.rejected, false);
  assert.equal(bare.reminder.available, false);
  assert.equal(bare.reminder.cooldownSeconds, 0);
  assert.equal(bare.confirmation.isManual, false);
});

test('checkout_completed alone still means paid', () => {
  assert.equal(normalizePayment({ checkout_completed: true }).isPaid, true);
});

test('poll_after is ignored unless the server asks for polling', () => {
  const claimed = normalizePayment(CLAIMED);
  assert.equal(claimed.shouldPoll, false, 'nothing may start a timer');
  assert.equal(pollDelayMs({ pollAfter: 5, shouldPoll: true }), 5000);
  assert.equal(pollDelayMs(null), 3000);
});

test('labels come from the enum, not the API English', () => {
  const p = normalizePayment(CLAIMED);
  assert.equal(enumText(t, 'payment.status', p.status, p.statusLabel), 'بانتظار تأكيد المتجر');
  assert.equal(
    enumText(t, 'payment.status', normalizePayment(REJECTED).status, 'Payment not confirmed'),
    'لم يتم تأكيد الدفع',
  );
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
  assert.equal(isLtrValue('ORD-260830-UISXJ'), true);
  assert.equal(isLtrValue('Main Branch Ltd'), false);
  assert.equal(isLtrValue('فرع رام الله 2'), false);
});

/*
 * The smart path, unchanged: JawwalPay still opens its in-app OTP and
 * still polls. The OTP is decided by `requires_otp`, never by the method
 * name — and a manual claim response must never open one.
 */
test('a smart checkout response still opens the JawwalPay OTP session', () => {
  const response = {
    order: { order_number: 'ORD-260830-AAAA' },
    payment: {
      method: 'jawwalpay', status: 'awaiting_approval',
      requires_otp: true, otp_length: 6, payment_session_id: 'sess-1',
      notified_phone: '+9705••••0111', expires_in: 120,
      should_poll: true, poll_after: 3, checkout_completed: false,
    },
  };

  const session = normalizeJawwalPayOtpSession(response, { phone: '+970598304517' });
  assert.ok(session, 'the OTP screen is reached');
  assert.equal(session.paymentSessionId, 'sess-1');
  assert.equal(session.otpLength, JAWWAL_PAY_OTP_LENGTH);
  assert.equal(session.expiresIn, 120, 'its own countdown, not payment.expires_in');
  assert.equal(shouldOpenJawwalPayOtp(response, {}), true);
});

test('a manual claim response opens no OTP session', () => {
  const response = { order: { order_number: 'ORD-260830-UISXJ' }, payment: CLAIMED };
  assert.equal(normalizeJawwalPayOtpSession(response, {}), null);
  assert.equal(shouldOpenJawwalPayOtp(response, {}), false);
});

test('a smart payment in flight still polls, on the server cadence', () => {
  const p = normalizePayment({
    ...SMART_PAID,
    status: 'awaiting_approval', status_label: 'Awaiting approval',
    is_paid: false, paid_at: null, checkout_completed: false,
    should_poll: true, poll_after: 3, expires_in: 120,
    claim: { claimed: false, claimed_at: null, is_verified: false, is_rejected: false },
    confirmation: { source: null, is_manual: false, is_automatic: false },
  });

  assert.equal(p.shouldPoll, true, 'the smart flow keeps polling');
  assert.equal(pollDelayMs(p), 3000);
  assert.equal(p.requiresConfirmation, false, 'no human is ever in this loop');
  assert.equal(p.awaitingConfirmation, false, 'so no waiting banner');
  assert.equal(p.instructions, null, 'and no pay-from screen');
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

/*
|--------------------------------------------------------------------------
| Payment Contract
|--------------------------------------------------------------------------
| One place that reads the API's payment block, for both endpoints that
| return it:
|
|   GET /orders/{n}            -> data.payment
|   GET /orders/{n}/payment    -> data.payment
|
| Two rules this module exists to enforce.
|
| FIRST: nothing in the app branches on the payment method's name. How
| the money moves, and whether a human is in the loop, are answered by
| booleans the API always sends:
|
|   settlement            'smart' | 'peer'   how the money moves
|   requiresConfirmation  a person verifies this order's payment, ever
|   awaitingConfirmation  that verification is outstanding RIGHT NOW
|   isPaid                the ONLY flag that means paid
|
| SECOND: a customer's claim is not a payment. On a manual method the
| customer presses "I have paid" and that records `claim.claimed` — a
| statement, nothing more. Only the store can turn it into `isPaid`, and
| only the store can reject it. Never render a claim as paid, confirmed,
| successful or done.
|
|   claim.claimed      the customer said they paid
|   claim.isVerified   the store agreed  (=== isPaid)
|   claim.isRejected   the store disagreed
|
| `claim`, `rejection` and `reminder` are present on EVERY method — all
| false/null for a smart payment. Read the booleans inside them rather
| than testing whether the key exists.
|
| Language note: the API has no locale negotiation, so `status_label`,
| `settlement_label`, `source_label` and `description` arrive in ENGLISH
| for every caller. The app is Arabic by default, so every label here is
| translated from the STABLE enum value and only falls back to the API's
| own string when we have no translation for a newly added value.
*/

/** Slowest acceptable background refresh for a cashier-resolved payment. */
export const MANUAL_REFRESH_MIN_MS = 60000;

/** Enum value -> i18n key segment. */
function enumKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function text(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

function bool(value) {
  return value === true;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Translate a stable enum value, falling back to whatever the API called
 * it. A status or settlement added to the backend after this release
 * still renders — in English — instead of disappearing.
 *
 * @param {(key: string, options?: object) => string} t
 * @param {string} namespace i18n prefix, e.g. 'payment.status'
 * @param {string|null|undefined} value the enum value from the API
 * @param {string|null|undefined} fallback the API's own *_label
 * @returns {string}
 */
export function enumText(t, namespace, value, fallback = null) {
  const key = enumKey(value);
  const translated = key ? t(`${namespace}.${key}`, { defaultValue: '' }) : '';
  return translated || text(fallback) || '';
}

/** @param {(key: string, options?: object) => string} t */
export const paymentStatusText = (t, payment) =>
  enumText(t, 'payment.status', payment?.status, payment?.statusLabel);

/** @param {(key: string, options?: object) => string} t */
export const settlementText = (t, settlement, fallback = null) =>
  enumText(t, 'payment.settlement', settlement, fallback);

/** @param {(key: string, options?: object) => string} t */
export const confirmationSourceText = (t, confirmation) =>
  enumText(t, 'payment.source', confirmation?.source, confirmation?.sourceLabel);

/**
 * Label for one account row. `rows[].field` is a stable enum and the API
 * sends no label for it, so an unknown field falls back to a readable
 * form of the field name rather than to nothing.
 *
 * @param {(key: string, options?: object) => string} t
 * @param {string} field
 */
export function accountFieldText(t, field) {
  const key = enumKey(field);
  const translated = key ? t(`payment.field.${key}`, { defaultValue: '' }) : '';
  return translated || key.replace(/_/g, ' ');
}

/** Arabic block, used to tell a translated value from a latin/numeric one. */
const ARABIC = /[؀-ۿ]/;

/**
 * Whether a value should stay left-to-right inside the RTL layout.
 * Account numbers, wallet numbers, IBANs and order references are all
 * digit-bearing latin strings that RTL would otherwise scramble.
 *
 * Decided from the VALUE, not from a list of field names: which fields a
 * method sends is the store's business, and a hardcoded list would drop
 * the fix the day a new one appears.
 *
 * @param {string|null|undefined} value
 */
export function isLtrValue(value) {
  const trimmed = String(value ?? '');
  return /\d/.test(trimmed) && !ARABIC.test(trimmed);
}

/**
 * The transfer screen payload: who to pay, how much, and the reference
 * to write on the transfer.
 *
 * Rebuilt server-side from a snapshot frozen when the payment request
 * was pushed, so a customer mid-transfer keeps seeing the account they
 * were originally told to pay even if the store edits its details. Never
 * cache it past the session — always re-read it from the API.
 *
 * `null` for every smart method: branch on that, never on the method.
 *
 * @param {any} raw
 */
export function normalizePaymentInstructions(raw) {
  if (!raw || typeof raw !== 'object') return null;

  /* Ordered by the API — a wallet has no IBAN, a bank has no wallet
     number — so it is rendered in the order given, never reordered or
     filtered against a field list of ours. */
  const rows = (Array.isArray(raw.rows) ? raw.rows : [])
    .map((row) => ({
      field: text(row?.field) ?? '',
      value: text(row?.value) ?? '',
      /* The values people paste into their banking app. */
      copyable: bool(row?.copyable),
    }))
    .filter((row) => row.field && row.value);

  return {
    settlement: text(raw.settlement),
    method: text(raw.method),
    methodLabel: text(raw.method_label),
    rows,
    /* Server-rounded to 2 decimals; formatted, never recomputed. */
    amount: num(raw.amount),
    /* The order's own frozen currency — not the store default. */
    currency: text(raw.currency),
    reference: text(raw.reference),
    note: text(raw.note),
  };
}

/**
 * Who confirmed the payment, and when. Present on every paid order:
 * `automatic` when the gateway settled it (no `confirmedBy` — no person
 * decided it), `manual` when a cashier did.
 *
 * @param {any} raw
 */
function normalizeConfirmation(raw) {
  return {
    source: text(raw?.source),
    sourceLabel: text(raw?.source_label),
    isManual: bool(raw?.is_manual),
    isAutomatic: bool(raw?.is_automatic),
    confirmedAt: text(raw?.confirmed_at),
    /* A display name, not an id, and null for automatic payments. */
    confirmedBy: text(raw?.confirmed_by),
    /* Free text the cashier typed, e.g. a receipt number. */
    note: text(raw?.note),
  };
}

/**
 * The customer's own statement that they paid. `claimed` is set the
 * moment they press the button; everything else is the store's answer to
 * it. A claim on its own is never paid — that is `isVerified`/`isPaid`.
 *
 * All false for a smart payment, where nobody claims anything: the
 * gateway settles it and `isVerified` comes back true on its own.
 *
 * @param {any} raw
 */
function normalizeClaim(raw) {
  return {
    claimed: bool(raw?.claimed),
    claimedAt: text(raw?.claimed_at),
    isVerified: bool(raw?.is_verified),
    isRejected: bool(raw?.is_rejected),
  };
}

/**
 * The store's refusal: it could not find the money. A rejection is a
 * statement about the PAYMENT, not a decision to bin the order — the
 * order stays `pending` and stays cancellable.
 *
 * Not retryable, deliberately: a mistaken rejection is fixed by the
 * cashier approving, never by the customer re-claiming.
 *
 * @param {any} raw
 */
function normalizeRejection(raw) {
  return {
    rejected: bool(raw?.rejected),
    rejectedAt: text(raw?.rejected_at),
    rejectedBy: text(raw?.rejected_by),
    /* Shown to the customer as-is. */
    reason: text(raw?.reason),
  };
}

/**
 * The only lever the customer has while they wait: nudge the store. It
 * notifies and nothing else — it cannot move the payment.
 *
 * The cooldown is the server's (15 min by default, configurable per
 * store), so it is read from every response and never hardcoded.
 *
 * @param {any} raw
 */
function normalizeReminder(raw) {
  return {
    available: bool(raw?.available),
    cooldownSeconds: num(raw?.cooldown_seconds) ?? 0,
    sentCount: num(raw?.sent_count) ?? 0,
    lastSentAt: text(raw?.last_sent_at),
  };
}

/**
 * The payment details for the CURRENT CART, before any order exists:
 * GET /manual-payment/{method}. This is the screen the customer pays
 * from, and the only place `instructions.reference` is legitimately null
 * — there is no order number to reference yet.
 *
 * @param {any} payload
 * @returns {{instructions: object|null, flow: object, totals: object}|null}
 */
export function normalizeManualPaymentPreview(payload) {
  const data = payload?.data ?? payload;
  const instructions = normalizePaymentInstructions(data?.instructions);
  if (!instructions) return null;

  const flow = data?.flow ?? {};
  const totals = data?.totals ?? {};

  return {
    instructions,
    flow: {
      requiresManualPayment: bool(flow.requires_manual_payment),
      confirmationRequired: bool(flow.confirmation_required),
      /* The order is created by the confirm call, not before it. */
      createsOrderOnConfirm: bool(flow.creates_order_on_confirm),
      paymentStatusAfterConfirm: text(flow.payment_status_after_confirm),
    },
    /* Server-rounded; formatted, never recomputed. */
    totals: {
      subtotal: num(totals.subtotal),
      discountTotal: num(totals.discount_total),
      deliveryFee: num(totals.delivery_fee),
      total: num(totals.total),
      currency: text(totals.currency) ?? instructions.currency,
    },
  };
}

/**
 * Normalize the payment block. Identical output for both endpoints that
 * carry it, so two screens can never disagree about the same order.
 *
 * @param {any} raw the `payment` object, or a response that wraps one
 * @returns {object|null}
 */
export function normalizePayment(raw) {
  const p = raw?.payment && typeof raw.payment === 'object' ? raw.payment : raw;
  if (!p || typeof p !== 'object') return null;

  const instructions = normalizePaymentInstructions(p.instructions);
  /* `checkout_completed` is the legacy alias of `is_paid`. */
  const isPaid = bool(p.is_paid) || bool(p.checkout_completed);

  return {
    method: text(p.method),
    methodLabel: text(p.method_label),
    status: text(p.status),
    statusLabel: text(p.status_label),
    description: text(p.description),
    /* The order number the customer writes on their transfer — the only
       thing tying their money to this order. The order endpoint carries
       it inside `instructions` only. */
    reference: text(p.reference) ?? instructions?.reference ?? null,
    notifiedPhone: text(p.notified_phone),
    failureReason: text(p.failure_reason),
    /* null for a manual payment: it never expires, so a countdown must
       never be rendered for one. */
    expiresIn: num(p.expires_in),
    attemptsRemaining: num(p.attempts_remaining),
    isPaid,
    isFinal: bool(p.is_final) || isPaid,
    paidAt: text(p.paid_at),
    isRetryable: bool(p.is_retryable),
    /* False forever for a manual payment — see startPaymentPolling. */
    shouldPoll: bool(p.should_poll),
    pollAfter: num(p.poll_after),
    settlement: text(p.settlement),
    settlementLabel: text(p.settlement_label),
    requiresConfirmation: bool(p.requires_confirmation),
    awaitingConfirmation: bool(p.awaiting_confirmation),
    /* The customer's statement, the store's answer, and the nudge — all
       three present on every method, all false/null for a smart one. */
    claim: normalizeClaim(p.claim),
    confirmation: normalizeConfirmation(p.confirmation),
    rejection: normalizeRejection(p.rejection),
    reminder: normalizeReminder(p.reminder),
    /* Present even on a PAID or REJECTED order, for the receipt view —
       so it can never be read as "still unpaid". */
    instructions,
  };
}

/**
 * Delay before the next poll, in ms. Only meaningful while `shouldPoll`
 * is true: `poll_after` is a non-zero default (3) even in a manual
 * payment's response, and must be ignored there.
 *
 * @param {object|null} payment
 */
export function pollDelayMs(payment) {
  const seconds = payment?.pollAfter;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 3000;
}

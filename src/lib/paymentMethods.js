/*
|--------------------------------------------------------------------------
| Payment Methods (GET /payment-methods)
|--------------------------------------------------------------------------
| The chooser is entirely API-driven. The backend returns ONLY methods
| that are both enabled and fully configured, so whatever comes back is
| rendered as-is — nothing here validates, filters or supplements it.
|
| An empty list means the store cannot take payment at all. That is a
| state to show, not an empty chooser to render.
|
| The `method` string is what POST /checkout expects as `payment_method`.
| Nothing else in the app may compare it against a literal: methods are
| added and removed in the store's config, and the app must not need a
| release for that. Behaviour comes from `settlement` / `isAutomatic`;
| the map below is a lookup for a logo asset, with an initial-letter
| fallback, so an unknown method still renders.
*/

import { settlementText } from './payment.js';

/** Cosmetic only — a method missing from this map still renders. */
const METHOD_LOGOS = {
  jawwalpay: '/payments/jawwalpay.png',
  palpay: 'https://www.palpay.ps/assets/images/logo-icon.svg',
  bop: 'https://bopwebsitestorage.blob.core.windows.net/assets/uploads/orPNSWQejpvlClB5nqmeg18jfbDJGyFO9Vn9KLeO.png',
};

/** @typedef {{field: string, value: string, copyable: boolean}} AccountRow */
/** @typedef {{rows: AccountRow[], note: string|null}} MethodAccount */
/** @typedef {{id: string, label: string, settlement: string|null,
 *   settlementLabel: string|null, isAutomatic: boolean, logo: string|null,
 *   account: MethodAccount|null}} PaymentMethod */

function text(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

/**
 * The account details a manual method is paid into. Present only on
 * manual methods; a smart method has no `account` key at all.
 *
 * Shown on the instructions screen, never previewed in the chooser —
 * at method-choice time no order exists, so there is no amount and no
 * reference to show alongside it.
 *
 * @param {any} raw
 * @returns {MethodAccount|null}
 */
function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const rows = (Array.isArray(raw.rows) ? raw.rows : [])
    .map((row) => ({
      field: text(row?.field) ?? '',
      value: text(row?.value) ?? '',
      copyable: row?.copyable === true,
    }))
    .filter((row) => row.field && row.value);

  return { rows, note: text(raw.note) };
}

/**
 * @param {any} raw one entry of `data.methods`
 * @returns {PaymentMethod|null}
 */
export function normalizePaymentMethod(raw) {
  const id = text(raw?.method);
  if (!id) return null;

  return {
    id,
    label: text(raw.label) ?? id,
    settlement: text(raw.settlement),
    settlementLabel: text(raw.settlement_label),
    /* false => the customer pays outside the app and the store confirms. */
    isAutomatic: raw.is_automatic === true,
    logo: METHOD_LOGOS[id] ?? null,
    account: normalizeAccount(raw.account),
  };
}

/**
 * @param {any} payload the GET /payment-methods response
 * @returns {PaymentMethod[]}
 */
export function normalizePaymentMethods(payload) {
  const methods = payload?.data?.methods ?? payload?.methods;
  if (!Array.isArray(methods)) return [];
  return methods.map(normalizePaymentMethod).filter(Boolean);
}

/**
 * @param {PaymentMethod[]} methods
 * @param {string|null|undefined} id
 */
export function findPaymentMethodIn(methods, id) {
  if (!id) return null;
  return methods.find((method) => method.id === id) ?? null;
}

/**
 * Display name. The API's `label` is English for every caller, so a
 * method we ship a translation for is shown in the user's language and
 * anything else falls back to what the API called it.
 *
 * @param {PaymentMethod|null|undefined} method
 * @param {(key: string, options?: object) => string} t
 */
export function paymentMethodLabel(method, t) {
  if (!method) return '';
  return t(`payment.methods.${method.id}.label`, { defaultValue: method.label });
}

/**
 * The caption under a method in the chooser. For a manual method it has
 * to make clear that the customer pays outside the app and the store
 * confirms afterwards — that expectation is the whole difference the
 * customer can see at choosing time.
 *
 * @param {PaymentMethod|null|undefined} method
 * @param {(key: string, options?: object) => string} t
 */
export function paymentMethodHint(method, t) {
  if (!method) return '';
  return t(`payment.methods.${method.id}.hint`, {
    defaultValue: t(method.isAutomatic ? 'payment.hints.smart' : 'payment.hints.peer'),
  });
}

/**
 * Group heading for the chooser: the settlement, translated from the
 * enum rather than taken from the API's English `settlement_label`.
 *
 * @param {PaymentMethod|null|undefined} method
 * @param {(key: string, options?: object) => string} t
 */
export function paymentMethodSettlementLabel(method, t) {
  return settlementText(t, method?.settlement, method?.settlementLabel);
}

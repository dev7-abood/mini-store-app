/*
|--------------------------------------------------------------------------
| Money Formatting
|--------------------------------------------------------------------------
| The ONE place a currency amount becomes a string. The backend is the
| single pricing authority: it computes and rounds every figure to 2
| decimals, and the client only ever formats what it was given.
|
| Rules enforced here:
|   • No arithmetic. Nothing in this module (or its callers) multiplies,
|     sums or rounds money — a raw `7.8` and a broken `7.799999999999999`
|     both render as `7.80`, so a column of amounts never looks ragged.
|   • Always exactly two decimals (minimumFractionDigits =
|     maximumFractionDigits = 2).
|   • Latin digits, no grouping separators, so only the DECIMALS change
|     versus what shipped before — the ₪ symbol and its placement stay
|     with the i18n `common.currency` template, and RTL layout is
|     untouched.
|
| A value the server has not sent yet (null/undefined/NaN) returns null,
| never `0.00` — callers hide the figure instead of inventing one.
*/

/** Fixed 2-decimal formatter; locale-independent on purpose (see above). */
const FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

/**
 * Format a server-provided amount as a bare 2-decimal number string.
 *
 * @param {number|string|null|undefined} amount
 * @returns {string|null} e.g. "7.80", or null when there is no amount yet
 */
export function formatMoney(amount) {
  if (amount === null || amount === undefined || amount === '') return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  /* `value === 0` also catches -0, which would print as "-0.00". */
  return FORMATTER.format(value === 0 ? 0 : value);
}

/**
 * First finite amount among the candidates — used by the API layer to
 * read whichever key a payload happens to carry. Returns null when the
 * server sent none of them, so "unknown" stays distinguishable from 0.
 *
 * @param {...any} candidates
 * @returns {number|null}
 */
export function pickMoney(...candidates) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/*
|--------------------------------------------------------------------------
| Currency
|--------------------------------------------------------------------------
| An order freezes its own currency, and the payment instructions carry
| it. Amounts are rendered in THAT currency, never in a hardcoded symbol
| or the store default.
*/

/** ISO code -> symbol, for the currencies that HAVE one. */
const CURRENCY_SYMBOLS = {
  ILS: '₪',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

/**
 * Normalized ISO code, or null when no currency was given — callers then
 * fall back to the locale's own currency template.
 *
 * @param {string|null|undefined} code
 * @returns {string|null}
 */
export function currencyCode(code) {
  const normalized = String(code ?? '').trim().toUpperCase();
  return normalized || null;
}

/**
 * Display symbol for a currency code, or null when it has none — a code
 * without a symbol is written out in full instead ("JOD 12.00"), which
 * beats inventing a glyph for it.
 *
 * @param {string|null|undefined} code
 * @returns {string|null}
 */
export function currencySymbol(code) {
  const normalized = currencyCode(code);
  return normalized ? CURRENCY_SYMBOLS[normalized] ?? null : null;
}

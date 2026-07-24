/*
|--------------------------------------------------------------------------
| Payment Methods
|--------------------------------------------------------------------------
| The `id` of each entry is sent to the API as `payment_method`, so these
| strings MUST match the values the backend validates against. Change
| them here only — nothing else hardcodes a method.
|
| `enabled: false` keeps a method defined but out of the UI. Cash on
| delivery is switched off because the backend does not accept it yet —
| flip the flag to bring it back, no other file needs touching.
|
| `logo` points at a file in public/payments (transparent PNG); when a
| method has no logo the emoji is used instead.
*/

/** @typedef {{id: string, labelKey: string, hintKey: string,
 *   enabled: boolean, logo?: string, icon?: string}} PaymentMethod */

/** @type {PaymentMethod[]} */
export const PAYMENT_METHODS = [
  {
    id: 'jawwalpay',
    labelKey: 'payment.jawwalpay.label',
    hintKey: 'payment.jawwalpay.hint',
    logo: '/payments/jawwalpay.png',
    enabled: true,
  },
  {
    id: 'cash',
    labelKey: 'payment.cash.label',
    hintKey: 'payment.cash.hint',
    icon: '💵',
    enabled: false, // not supported by the API yet
  },
];

/** Methods actually offered to the customer. */
export const AVAILABLE_PAYMENT_METHODS = PAYMENT_METHODS.filter((m) => m.enabled);

/**
 * Preselected method — the first enabled one, so the customer never
 * faces a required field with nothing chosen.
 *
 * @type {string}
 */
export const DEFAULT_PAYMENT_METHOD = AVAILABLE_PAYMENT_METHODS[0]?.id ?? '';

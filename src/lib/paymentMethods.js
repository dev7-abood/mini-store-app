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
| `logo` can point at a file in public/payments or a provider-hosted URL;
| when a method has no logo the icon is used instead.
*/

/** @typedef {{id: string, labelKey: string, hintKey: string,
 *   type: 'smart'|'manual', enabled: boolean, logo?: string, icon?: string,
 *   badgeKey?: string, recommended?: boolean}} PaymentMethod */

/** @type {PaymentMethod[]} */
export const PAYMENT_METHODS = [
  {
    id: 'jawwalpay',
    labelKey: 'payment.jawwalpay.label',
    hintKey: 'payment.jawwalpay.hint',
    type: 'smart',
    badgeKey: 'payment.badges.recommended',
    recommended: true,
    logo: '/payments/jawwalpay.png',
    enabled: true,
  },
  {
    id: 'palpay',
    labelKey: 'payment.palpay.label',
    hintKey: 'payment.palpay.hint',
    type: 'manual',
    logo: 'https://www.palpay.ps/storage/2025/01/07/bG9nbzE3MzYyNTQwNzg=.svg',
    enabled: true,
  },
  {
    id: 'bank_of_palestine',
    labelKey: 'payment.bankOfPalestine.label',
    hintKey: 'payment.bankOfPalestine.hint',
    type: 'manual',
    logo: 'https://bopwebsitestorage.blob.core.windows.net/assets/uploads/orPNSWQejpvlClB5nqmeg18jfbDJGyFO9Vn9KLeO.png',
    enabled: true,
  },
  {
    id: 'cash',
    labelKey: 'payment.cash.label',
    hintKey: 'payment.cash.hint',
    type: 'manual',
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

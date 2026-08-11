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

/** @typedef {{
 *   receiverName?: string,
 *   accountHolderName?: string,
 *   walletPhoneNumber?: string,
 *   accountNumber?: string,
 *   bankOrWalletName?: string,
 *   bankName?: string,
 *   iban?: string,
 *   branchName?: string,
 *   additionalInstructions?: string,
 *   additionalInstructionsKey?: string,
 * }} ManualPaymentReceivingInfo */

/** @typedef {{id: string, labelKey: string, hintKey: string,
 *   type: 'smart'|'manual', enabled: boolean, logo?: string, icon?: string,
 *   badgeKey?: string, recommended?: boolean,
 *   receivingInfo?: ManualPaymentReceivingInfo}} PaymentMethod */

const manualEnv = (methodKey, field) =>
  import.meta.env?.[`VITE_MANUAL_PAYMENT_${methodKey}_${field}`] ?? '';

const manualReceivingInfo = (methodKey, defaults = {}) => ({
  receiverName: manualEnv(methodKey, 'RECEIVER_NAME'),
  accountHolderName: manualEnv(methodKey, 'ACCOUNT_HOLDER_NAME'),
  walletPhoneNumber: manualEnv(methodKey, 'WALLET_PHONE_NUMBER') || manualEnv(methodKey, 'WALLET_PHONE'),
  accountNumber: manualEnv(methodKey, 'ACCOUNT_NUMBER'),
  bankOrWalletName:
    manualEnv(methodKey, 'BANK_OR_WALLET_NAME')
    || manualEnv(methodKey, 'BANK_NAME')
    || defaults.bankOrWalletName
    || '',
  bankName: manualEnv(methodKey, 'BANK_NAME'),
  iban: manualEnv(methodKey, 'IBAN'),
  branchName: manualEnv(methodKey, 'BRANCH_NAME'),
  additionalInstructions:
    manualEnv(methodKey, 'ADDITIONAL_INSTRUCTIONS') || defaults.additionalInstructions || '',
  additionalInstructionsKey: defaults.additionalInstructionsKey,
});

/** @type {PaymentMethod[]} */
export const PAYMENT_METHODS = [
  {
    id: 'jawwalpay',
    labelKey: 'payment.jawwalpay.label',
    hintKey: 'payment.jawwalpay.hint',
    type: 'smart',
    recommended: true,
    logo: '/payments/jawwalpay.png',
    enabled: true,
  },
  {
    id: 'palpay',
    labelKey: 'payment.palpay.label',
    hintKey: 'payment.palpay.hint',
    type: 'manual',
    logo: 'https://www.palpay.ps/assets/images/logo-icon.svg',
    receivingInfo: manualReceivingInfo('PALPAY', {
      bankOrWalletName: 'PalPay',
      additionalInstructionsKey: 'payment.palpay.instructions',
    }),
    enabled: true,
  },
  {
    id: 'bank_of_palestine',
    labelKey: 'payment.bankOfPalestine.label',
    hintKey: 'payment.bankOfPalestine.hint',
    type: 'manual',
    logo: 'https://bopwebsitestorage.blob.core.windows.net/assets/uploads/orPNSWQejpvlClB5nqmeg18jfbDJGyFO9Vn9KLeO.png',
    receivingInfo: manualReceivingInfo('BANK_OF_PALESTINE', {
      bankOrWalletName: 'Bank of Palestine',
      additionalInstructionsKey: 'payment.bankOfPalestine.instructions',
    }),
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

/** @param {string | null | undefined} id */
export function findPaymentMethod(id) {
  return PAYMENT_METHODS.find((method) => method.id === id) ?? null;
}

/** @param {string | null | undefined} id */
export function isManualPaymentMethod(id) {
  return findPaymentMethod(id)?.type === 'manual';
}

/** @param {any} raw */
export function normalizeManualPaymentReceivingInfo(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const info = {
    receiverName: raw.receiverName ?? raw.receiver_name ?? raw.account_name ?? raw.name ?? '',
    accountHolderName:
      raw.accountHolderName
      ?? raw.account_holder_name
      ?? raw.holder_name
      ?? raw.account_name
      ?? '',
    walletPhoneNumber:
      raw.walletPhoneNumber
      ?? raw.wallet_phone_number
      ?? raw.wallet_phone
      ?? raw.phone
      ?? '',
    accountNumber:
      raw.accountNumber
      ?? raw.account_number
      ?? '',
    bankOrWalletName:
      raw.bankOrWalletName
      ?? raw.bank_or_wallet_name
      ?? raw.bank_name
      ?? raw.wallet_name
      ?? raw.provider_name
      ?? '',
    bankName:
      raw.bankName
      ?? raw.bank_name
      ?? raw.bankOrWalletName
      ?? raw.bank_or_wallet_name
      ?? '',
    iban: raw.iban ?? raw.IBAN ?? '',
    branchName: raw.branchName ?? raw.branch_name ?? '',
    additionalInstructions:
      raw.additionalInstructions
      ?? raw.additional_instructions
      ?? raw.instructions
      ?? raw.note
      ?? '',
    additionalInstructionsKey: raw.additionalInstructionsKey ?? raw.additional_instructions_key ?? '',
  };

  const normalized = Object.fromEntries(
    Object.entries(info).map(([key, value]) => [key, String(value ?? '').trim()]),
  );

  return Object.values(normalized).some(Boolean) ? normalized : null;
}

/**
 * Frontend configured receiving details, optionally overridden by the order
 * payload returned from the backend.
 *
 * @param {string | null | undefined} id
 * @param {any} [override]
 */
export function manualReceivingInfoForMethod(id, override = null) {
  const method = findPaymentMethod(id);
  if (!method || method.type !== 'manual') return null;

  const configured = normalizeManualPaymentReceivingInfo(method.receivingInfo) ?? {};
  const backend = Object.fromEntries(
    Object.entries(normalizeManualPaymentReceivingInfo(override) ?? {})
      .filter(([, value]) => Boolean(value)),
  );
  const merged = { ...configured, ...backend };

  return Object.values(merged).some(Boolean) ? merged : null;
}

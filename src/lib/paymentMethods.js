/*
|--------------------------------------------------------------------------
| Payment Methods
|--------------------------------------------------------------------------
| The `id` of each entry is sent to the API as `payment_method`, so these
| strings MUST match the values the backend validates against. The static
| list supplies UI metadata and local-development fallbacks; tenant manual
| payment activation/details come from GET /payment-methods when a backend
| is configured.
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
 *   address?: string,
 *   additionalInstructions?: string,
 *   additionalInstructionsKey?: string,
 * }} ManualPaymentReceivingInfo */

/** @typedef {{id: string, labelKey?: string, label?: string, hintKey?: string, hint?: string,
 *   type: 'smart'|'manual', enabled: boolean, logo?: string, icon?: string,
 *   badgeKey?: string, recommended?: boolean, source?: 'static'|'api',
 *   receivingInfo?: ManualPaymentReceivingInfo}} PaymentMethod */

const manualEnv = (methodKey, field) =>
  import.meta.env?.[`VITE_MANUAL_PAYMENT_${methodKey}_${field}`] ?? '';

const trimText = (value) => String(value ?? '').trim();

const firstText = (...values) => {
  for (const value of values) {
    const text = trimText(value);
    if (text) return text;
  }
  return '';
};

const cleanObject = (value) =>
  Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [key, trimText(entryValue)])
      .filter(([, entryValue]) => Boolean(entryValue)),
  );

const manualReceivingInfo = (methodKey) => ({
  receiverName: manualEnv(methodKey, 'RECEIVER_NAME'),
  accountHolderName: manualEnv(methodKey, 'ACCOUNT_HOLDER_NAME'),
  walletPhoneNumber:
    manualEnv(methodKey, 'WALLET_PHONE_NUMBER')
    || manualEnv(methodKey, 'WALLET_PHONE')
    || manualEnv(methodKey, 'PHONE_NUMBER'),
  accountNumber: manualEnv(methodKey, 'ACCOUNT_NUMBER'),
  bankOrWalletName:
    manualEnv(methodKey, 'BANK_OR_WALLET_NAME')
    || manualEnv(methodKey, 'WALLET_NAME')
    || manualEnv(methodKey, 'BANK_NAME'),
  bankName: manualEnv(methodKey, 'BANK_NAME'),
  iban: manualEnv(methodKey, 'IBAN'),
  branchName: manualEnv(methodKey, 'BRANCH_NAME'),
  address: manualEnv(methodKey, 'ADDRESS'),
  additionalInstructions:
    manualEnv(methodKey, 'ADDITIONAL_INSTRUCTIONS')
    || manualEnv(methodKey, 'INSTRUCTIONS')
    || manualEnv(methodKey, 'NOTES'),
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
    source: 'static',
  },
  {
    id: 'palpay',
    labelKey: 'payment.palpay.label',
    hintKey: 'payment.palpay.hint',
    type: 'manual',
    logo: 'https://www.palpay.ps/assets/images/logo-icon.svg',
    receivingInfo: manualReceivingInfo('PALPAY'),
    enabled: true,
    source: 'static',
  },
  {
    id: 'bank_of_palestine',
    labelKey: 'payment.bankOfPalestine.label',
    hintKey: 'payment.bankOfPalestine.hint',
    type: 'manual',
    logo: 'https://bopwebsitestorage.blob.core.windows.net/assets/uploads/orPNSWQejpvlClB5nqmeg18jfbDJGyFO9Vn9KLeO.png',
    receivingInfo: manualReceivingInfo('BANK_OF_PALESTINE'),
    enabled: true,
    source: 'static',
  },
  {
    id: 'cash',
    labelKey: 'payment.cash.label',
    hintKey: 'payment.cash.hint',
    type: 'manual',
    icon: '$',
    enabled: false,
    source: 'static',
  },
];

/** Methods offered without tenant settings, used only as a local fallback. */
export const AVAILABLE_PAYMENT_METHODS = PAYMENT_METHODS.filter((method) => method.enabled);

/**
 * Preselected fallback method: the first enabled static one, so the customer
 * never faces a required field with nothing chosen in local development.
 *
 * @type {string}
 */
export const DEFAULT_PAYMENT_METHOD = AVAILABLE_PAYMENT_METHODS[0]?.id ?? '';

/** @param {string | null | undefined} id */
export function findPaymentMethod(id) {
  return PAYMENT_METHODS.find((method) => method.id === id) ?? null;
}

/** @param {PaymentMethod[]} methods @param {string | null | undefined} id */
export function findPaymentMethodIn(methods, id) {
  return methods.find((method) => method.id === id) ?? null;
}

/** @param {string | null | undefined} id */
export function isManualPaymentMethod(id) {
  return findPaymentMethod(id)?.type === 'manual';
}

function normalizeKey(value) {
  return trimText(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** @param {unknown} value */
export function normalizePaymentMethodId(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return '';

  const compact = normalized.replace(/_/g, '');
  if (compact === 'jawwalpay' || compact === 'jawwal' || compact.endsWith('jawwalpay')) {
    return 'jawwalpay';
  }
  if (compact === 'palpay' || compact === 'palpaywallet' || compact.endsWith('palpay')) {
    return 'palpay';
  }
  if (
    compact === 'bankofpalestine'
    || compact === 'bankpalestine'
    || compact === 'bop'
    || compact.endsWith('bop')
    || compact.endsWith('bankofpalestine')
  ) {
    return 'bank_of_palestine';
  }

  return normalized;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = normalizeKey(value);
    if (['1', 'true', 'yes', 'enabled', 'enable', 'active', 'on', 'available'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'disabled', 'disable', 'inactive', 'off', 'unavailable'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function pick(raw, keys) {
  for (const key of keys) {
    const value = raw?.[key];
    const text = trimText(value);
    if (text) return text;
  }
  return '';
}

/** @param {any} raw */
export function normalizeManualPaymentReceivingInfo(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const normalized = cleanObject({
    receiverName: pick(raw, [
      'receiverName',
      'receiver_name',
      'recipientName',
      'recipient_name',
      'receiver',
      'recipient',
      'account_name',
      'accountName',
      'name',
    ]),
    accountHolderName: pick(raw, [
      'accountHolderName',
      'account_holder_name',
      'holder_name',
      'holderName',
      'account_holder',
      'beneficiary_name',
      'beneficiaryName',
      'account_name',
      'accountName',
    ]),
    walletPhoneNumber: pick(raw, [
      'walletPhoneNumber',
      'wallet_phone_number',
      'walletNumber',
      'wallet_number',
      'wallet_phone',
      'phone_number',
      'phoneNumber',
      'mobile_number',
      'mobileNumber',
      'mobile',
      'phone',
    ]),
    accountNumber: pick(raw, [
      'accountNumber',
      'account_number',
      'bank_account_number',
      'bankAccountNumber',
      'bank_account',
      'bankAccount',
    ]),
    bankOrWalletName: pick(raw, [
      'bankOrWalletName',
      'bank_or_wallet_name',
      'walletName',
      'wallet_name',
      'providerName',
      'provider_name',
      'paymentProvider',
      'payment_provider',
      'bankName',
      'bank_name',
    ]),
    bankName: pick(raw, ['bankName', 'bank_name']),
    iban: pick(raw, ['iban', 'IBAN']),
    branchName: pick(raw, ['branchName', 'branch_name']),
    address: pick(raw, [
      'address',
      'receiverAddress',
      'receiver_address',
      'recipientAddress',
      'recipient_address',
      'paymentAddress',
      'payment_address',
    ]),
    additionalInstructions: pick(raw, [
      'additionalInstructions',
      'additional_instructions',
      'paymentInstructions',
      'payment_instructions',
      'instructions',
      'notes',
      'note',
    ]),
    additionalInstructionsKey: pick(raw, [
      'additionalInstructionsKey',
      'additional_instructions_key',
    ]),
  });

  const hasDisplayValue = Object.entries(normalized)
    .some(([key, value]) => key !== 'additionalInstructionsKey' && Boolean(value));

  return hasDisplayValue ? normalized : null;
}

function mergeManualReceivingInfo(...values) {
  const merged = values.reduce(
    (carry, value) => ({ ...carry, ...(normalizeManualPaymentReceivingInfo(value) ?? {}) }),
    {},
  );

  return Object.values(merged).some(Boolean) ? merged : null;
}

function receivingInfoKeyForAccountRow(field) {
  const normalized = normalizeKey(field);
  if (!normalized) return null;

  if ([
    'recipient',
    'recipient_name',
    'receiver',
    'receiver_name',
    'beneficiary',
    'beneficiary_name',
    'account_name',
    'name',
  ].includes(normalized)) {
    return 'receiverName';
  }

  if ([
    'account_holder',
    'account_holder_name',
    'holder',
    'holder_name',
    'owner',
    'owner_name',
  ].includes(normalized)) {
    return 'accountHolderName';
  }

  if ([
    'wallet_phone_number',
    'wallet_phone',
    'wallet_number',
    'phone_number',
    'phone',
    'mobile_number',
    'mobile',
  ].includes(normalized)) {
    return 'walletPhoneNumber';
  }

  if ([
    'account_number',
    'bank_account_number',
    'bank_account',
    'account',
  ].includes(normalized)) {
    return 'accountNumber';
  }

  if ([
    'bank_or_wallet_name',
    'wallet_name',
    'provider_name',
    'payment_provider',
    'provider',
  ].includes(normalized)) {
    return 'bankOrWalletName';
  }

  if (['bank_name', 'bank'].includes(normalized)) return 'bankName';
  if (normalized === 'iban') return 'iban';
  if (['branch', 'branch_name'].includes(normalized)) return 'branchName';

  if ([
    'address',
    'receiver_address',
    'recipient_address',
    'payment_address',
  ].includes(normalized)) {
    return 'address';
  }

  if ([
    'instructions',
    'instruction',
    'additional_instructions',
    'payment_instructions',
    'note',
    'notes',
  ].includes(normalized)) {
    return 'additionalInstructions';
  }

  return null;
}

function accountRowsReceivingInfo(account) {
  const rows = Array.isArray(account)
    ? account
    : Array.isArray(account?.rows)
      ? account.rows
      : [];

  if (rows.length === 0 && !account?.note && !account?.notes && !account?.instructions) {
    return null;
  }

  const info = {
    additionalInstructions: firstText(account?.note, account?.notes, account?.instructions),
  };

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;

    const key = receivingInfoKeyForAccountRow(
      row.field ?? row.key ?? row.name ?? row.label ?? row.type,
    );
    const value = firstText(row.value, row.text, row.content);

    if (key && value && !info[key]) {
      info[key] = value;
    }
  }

  return cleanObject(info);
}

function explicitReceivingInfoFromMethod(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return cleanObject({
    receiverName: firstText(
      raw.receiverName,
      raw.receiver_name,
      raw.recipientName,
      raw.recipient_name,
      raw.receiver,
      raw.recipient,
      raw.account_name,
      raw.accountName,
    ),
    accountHolderName: firstText(
      raw.accountHolderName,
      raw.account_holder_name,
      raw.account_holder,
      raw.holder_name,
      raw.holderName,
      raw.beneficiary_name,
      raw.beneficiaryName,
      raw.account_name,
      raw.accountName,
    ),
    walletPhoneNumber: firstText(
      raw.walletPhoneNumber,
      raw.wallet_phone_number,
      raw.walletNumber,
      raw.wallet_number,
      raw.wallet_phone,
      raw.phone_number,
      raw.phoneNumber,
      raw.mobile_number,
      raw.mobileNumber,
      raw.mobile,
      raw.phone,
    ),
    accountNumber: firstText(
      raw.accountNumber,
      raw.account_number,
      raw.bank_account_number,
      raw.bankAccountNumber,
      raw.bank_account,
      raw.bankAccount,
    ),
    bankOrWalletName: firstText(
      raw.bankOrWalletName,
      raw.bank_or_wallet_name,
      raw.walletName,
      raw.wallet_name,
      raw.providerName,
      raw.provider_name,
      raw.paymentProvider,
      raw.payment_provider,
      raw.bankName,
      raw.bank_name,
    ),
    bankName: firstText(raw.bankName, raw.bank_name),
    iban: firstText(raw.iban, raw.IBAN),
    branchName: firstText(raw.branchName, raw.branch_name),
    address: firstText(
      raw.address,
      raw.receiverAddress,
      raw.receiver_address,
      raw.recipientAddress,
      raw.recipient_address,
      raw.paymentAddress,
      raw.payment_address,
    ),
    additionalInstructions: firstText(
      raw.additionalInstructions,
      raw.additional_instructions,
      raw.paymentInstructions,
      raw.payment_instructions,
      raw.instructions,
      raw.notes,
      raw.note,
    ),
  });
}

function normalizeMethodReceivingInfo(raw) {
  const settings = raw?.settings && typeof raw.settings === 'object' ? raw.settings : null;
  const config = raw?.config && typeof raw.config === 'object' ? raw.config : null;
  const details = raw?.details && typeof raw.details === 'object' ? raw.details : null;
  const account = raw?.account && typeof raw.account === 'object' ? raw.account : null;

  return mergeManualReceivingInfo(
    raw?.receiving_info,
    raw?.receivingInfo,
    raw?.receiver,
    raw?.destination,
    raw?.payment_receiving_info,
    raw?.paymentReceivingInfo,
    raw?.manual_payment_info,
    raw?.manualPaymentInfo,
    raw?.payment_details,
    raw?.paymentDetails,
    accountRowsReceivingInfo(account),
    account,
    settings?.receiving_info,
    settings?.receivingInfo,
    settings?.manual_payment_info,
    settings?.manualPaymentInfo,
    accountRowsReceivingInfo(settings?.account),
    settings?.account,
    settings,
    config?.receiving_info,
    config?.receivingInfo,
    accountRowsReceivingInfo(config?.account),
    config?.account,
    config,
    details?.receiving_info,
    details?.receivingInfo,
    accountRowsReceivingInfo(details?.account),
    details?.account,
    details,
    explicitReceivingInfoFromMethod(raw),
  );
}

function rawPaymentMethodId(raw) {
  return firstText(
    raw?.key,
    raw?.slug,
    raw?.code,
    raw?.method,
    raw?.payment_method,
    raw?.paymentMethod,
    raw?.provider,
    raw?.provider_key,
    raw?.gateway,
    raw?.name,
    raw?.id,
  );
}

function normalizePaymentType(raw, fallback = null) {
  if (toBoolean(raw?.is_manual ?? raw?.isManual ?? raw?.manual, false)) return 'manual';
  if (toBoolean(raw?.is_smart ?? raw?.isSmart, false)) return 'smart';

  const automatic = raw?.is_automatic ?? raw?.isAutomatic ?? raw?.automatic;
  if (automatic !== undefined) return toBoolean(automatic, false) ? 'smart' : 'manual';

  const type = normalizeKey(
    raw?.type
    ?? raw?.payment_type
    ?? raw?.paymentType
    ?? raw?.settlement
    ?? raw?.kind
    ?? raw?.category,
  );

  if (!type) return fallback;
  if (
    type.includes('manual')
    || type.includes('peer')
    || type.includes('bank_transfer')
    || type.includes('transfer')
    || type.includes('cash')
  ) {
    return 'manual';
  }
  if (type.includes('smart') || type.includes('automatic') || type.includes('auto')) {
    return 'smart';
  }

  return fallback;
}

function paymentMethodEnabled(raw, fallback = true) {
  return toBoolean(
    raw?.enabled
    ?? raw?.active
    ?? raw?.is_enabled
    ?? raw?.isEnabled
    ?? raw?.is_active
    ?? raw?.isActive
    ?? raw?.available
    ?? raw?.account?.enabled
    ?? raw?.settings?.account?.enabled
    ?? raw?.config?.account?.enabled
    ?? raw?.details?.account?.enabled
    ?? raw?.status,
    fallback,
  );
}

function methodText(raw, keys) {
  for (const key of keys) {
    const value = trimText(raw?.[key]);
    if (value) return value;
  }
  return '';
}

function paymentMethodCandidates(payload) {
  const body = payload?.data ?? payload;
  const containers = [
    body?.payment_methods,
    body?.paymentMethods,
    body?.manual_payment_methods,
    body?.manualPaymentMethods,
    body?.methods,
    body,
  ].filter(Boolean);

  for (const container of containers) {
    if (Array.isArray(container)) return container;

    if (container && typeof container === 'object') {
      if (rawPaymentMethodId(container) && (
        'enabled' in container
        || 'active' in container
        || 'type' in container
        || 'payment_type' in container
        || 'receiving_info' in container
        || 'receivingInfo' in container
        || 'settings' in container
        || 'details' in container
      )) {
        return [container];
      }

      const entries = Object.entries(container)
        .filter(([key]) => !['success', 'data', 'meta', 'message'].includes(key))
        .map(([key, value]) => (
          value && typeof value === 'object'
            ? { key, ...value }
            : { key, enabled: value }
        ));

      if (entries.length > 0) return entries;
    }
  }

  return [];
}

/** @param {any} raw */
export function normalizeApiPaymentMethod(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = normalizePaymentMethodId(rawPaymentMethodId(raw));
  if (!id) return null;

  const base = findPaymentMethod(id);
  const receivingInfo = normalizeMethodReceivingInfo(raw);
  const type = normalizePaymentType(raw, base?.type ?? (receivingInfo ? 'manual' : null));
  if (!type) return null;

  return {
    ...(base ?? {}),
    id,
    label: methodText(raw, ['label', 'display_label', 'displayLabel', 'display_name', 'displayName', 'title']),
    hint: methodText(raw, ['hint', 'description', 'short_description', 'shortDescription']),
    type,
    logo: firstText(
      raw.logo,
      raw.logo_url,
      raw.logoUrl,
      raw.image,
      raw.image_url,
      raw.imageUrl,
      base?.logo,
    ),
    icon: firstText(raw.icon, base?.icon, '$'),
    enabled: paymentMethodEnabled(raw, true),
    receivingInfo: receivingInfo ?? undefined,
    source: 'api',
  };
}

/** @param {any} payload */
export function normalizeApiPaymentMethods(payload) {
  const methods = paymentMethodCandidates(payload)
    .map(normalizeApiPaymentMethod)
    .filter(Boolean);

  const deduped = new Map();
  for (const method of methods) {
    deduped.set(method.id, method);
  }

  return [...deduped.values()];
}

/**
 * Combine static smart methods with tenant-configured manual methods. Smart
 * methods intentionally stay on their existing local activation path.
 *
 * @param {any} payload
 * @param {{useStaticManualFallback?: boolean}} [options]
 * @returns {PaymentMethod[]}
 */
export function availablePaymentMethodsFromSettings(
  payload,
  { useStaticManualFallback = false } = {},
) {
  const smartMethods = PAYMENT_METHODS
    .filter((method) => method.type === 'smart' && method.enabled);

  const apiManualMethods = normalizeApiPaymentMethods(payload)
    .filter((method) => method.type === 'manual' && method.enabled);

  const manualMethods = apiManualMethods.length > 0 || !useStaticManualFallback
    ? apiManualMethods
    : PAYMENT_METHODS.filter((method) => method.type === 'manual' && method.enabled);

  return [...smartMethods, ...manualMethods];
}

/**
 * Frontend configured receiving details, optionally overridden by an order
 * payload returned from the backend.
 *
 * @param {string | null | undefined} id
 * @param {any} [override]
 */
export function manualReceivingInfoForMethod(id, override = null) {
  const method = findPaymentMethod(id);
  if (!method || method.type !== 'manual') return null;

  const merged = mergeManualReceivingInfo(method.receivingInfo, override);
  return merged && Object.values(merged).some(Boolean) ? merged : null;
}

/** @param {PaymentMethod | null | undefined} method */
export function manualReceivingInfoForPaymentMethod(method) {
  if (!method || method.type !== 'manual') return null;
  return normalizeManualPaymentReceivingInfo(method.receivingInfo);
}

/** @param {PaymentMethod | null | undefined} method @param {(key: string) => string} t */
export function paymentMethodLabel(method, t) {
  if (!method) return '';
  if (method.label) return method.label;
  return method.labelKey ? t(method.labelKey) : method.id;
}

/** @param {PaymentMethod | null | undefined} method @param {(key: string) => string} t */
export function paymentMethodHint(method, t) {
  if (!method) return '';
  if (method.hint) return method.hint;
  return method.hintKey ? t(method.hintKey) : '';
}

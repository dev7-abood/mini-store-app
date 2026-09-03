/* Extension included so the node test runner can load this module. */
import { isPalestinianMobileNumber } from './phone.js';

export const MIN_PAYMENT_NAME_LENGTH = 3;
export const MIN_DELIVERY_ADDRESS_LENGTH = 5;
/* A delivery name needs a first name AND a family name — one word is not
   enough to ask for at a door. More than two is fine and kept as typed.
   The backend enforces the same rule (App\Support\CustomerName). */
export const MIN_FULL_NAME_WORDS = 2;

/**
 * Collapse a typed name to single spaces, matching the backend's
 * normalization so the word count both sides see is the same.
 *
 * Non-breaking spaces and zero-width characters are handled explicitly:
 * Arabic keyboards emit both, and either would otherwise turn one word
 * into two, or two into one.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeFullName(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The words of a normalized name.
 *
 * @param {string} value
 * @returns {string[]}
 */
export function fullNameWords(value) {
  const normalized = normalizeFullName(value);
  return normalized ? normalized.split(' ') : [];
}

function validateFullName(fullName, t, namespace) {
  if (!fullName) return t(`${namespace}.errors.fullNameRequired`);
  if (fullName.length < MIN_PAYMENT_NAME_LENGTH) return t(`${namespace}.errors.fullNameShort`);
  if (fullNameWords(fullName).length < MIN_FULL_NAME_WORDS) {
    return t(`${namespace}.errors.fullNameWords`);
  }
  return '';
}

function validateAddress(address, t, namespace) {
  if (!address) return t(`${namespace}.errors.addressRequired`);
  if (address.length < MIN_DELIVERY_ADDRESS_LENGTH) return t(`${namespace}.errors.addressShort`);
  return '';
}

/**
 * The details POST /checkout needs, for any payment method.
 *
 * The same three fields whatever the settlement: the phone is where the
 * order's OTP goes, so it is required even when the money moves outside
 * the app. Nothing about the SENDER of a manual transfer is collected —
 * the store matches a transfer by the order number it carries, and a
 * customer can never assert their own payment anyway.
 *
 * The Telegram handle is never one of these fields. It travels with the
 * signed initData on every request and stays backend-only; it is not the
 * customer's name and is never offered as one.
 *
 * @param {{fullName: string, phone: string, address: string}} details
 * @param {(key: string) => string} t
 */
export function validatePaymentDetails(details, t) {
  const fullName = normalizeFullName(details.fullName);
  const address = details.address.trim();
  const errors = {};

  const fullNameError = validateFullName(fullName, t, 'paymentDetails');
  if (fullNameError) errors.fullName = fullNameError;

  if (!details.phone.trim()) {
    errors.phone = t('paymentDetails.errors.phoneRequired');
  } else if (!isPalestinianMobileNumber(details.phone)) {
    errors.phone = t('paymentDetails.errors.phoneInvalid');
  }

  const addressError = validateAddress(address, t, 'paymentDetails');
  if (addressError) errors.address = addressError;

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    value: { fullName, address },
  };
}

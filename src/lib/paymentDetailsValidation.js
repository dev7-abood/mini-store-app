import { isPalestinianMobileNumber } from './phone';

export const MIN_PAYMENT_NAME_LENGTH = 3;
export const MIN_DELIVERY_ADDRESS_LENGTH = 5;

function validateFullName(fullName, t, namespace) {
  if (!fullName) return t(`${namespace}.errors.fullNameRequired`);
  if (fullName.length < MIN_PAYMENT_NAME_LENGTH) return t(`${namespace}.errors.fullNameShort`);
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
 * @param {{fullName: string, phone: string, address: string}} details
 * @param {(key: string) => string} t
 */
export function validatePaymentDetails(details, t) {
  const fullName = details.fullName.trim();
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

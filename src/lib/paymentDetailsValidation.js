import { isPalestinianMobileNumber } from './phone';

export const MIN_PAYMENT_NAME_LENGTH = 3;
export const MIN_DELIVERY_ADDRESS_LENGTH = 5;
export const MIN_ACCOUNT_IDENTIFIER_LENGTH = 5;

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
 * @param {{fullName: string, phone: string, address: string}} sender
 */
export function validateSmartPaymentDetails(sender, t) {
  const fullName = sender.fullName.trim();
  const address = sender.address.trim();
  const errors = {};

  const fullNameError = validateFullName(fullName, t, 'smartPayment');
  if (fullNameError) errors.fullName = fullNameError;

  if (!sender.phone.trim()) {
    errors.phone = t('smartPayment.errors.phoneRequired');
  } else if (!isPalestinianMobileNumber(sender.phone)) {
    errors.phone = t('smartPayment.errors.phoneInvalid');
  }

  const addressError = validateAddress(address, t, 'smartPayment');
  if (addressError) errors.address = addressError;

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    value: { fullName, address },
  };
}

/**
 * @param {{fullName: string, accountIdentifier: string, address: string}} details
 */
export function validateManualPaymentDetails(details, t) {
  const fullName = details.fullName.trim();
  const accountIdentifier = details.accountIdentifier.trim();
  const address = details.address.trim();
  const errors = {};

  const fullNameError = validateFullName(fullName, t, 'manualPayment');
  if (fullNameError) errors.fullName = fullNameError;

  if (!accountIdentifier) {
    errors.accountIdentifier = t('manualPayment.errors.accountRequired');
  } else if (accountIdentifier.replace(/\s/g, '').length < MIN_ACCOUNT_IDENTIFIER_LENGTH) {
    errors.accountIdentifier = t('manualPayment.errors.accountShort');
  } else if (!/^[\p{L}\p{N}\s+_.-]+$/u.test(accountIdentifier)) {
    errors.accountIdentifier = t('manualPayment.errors.accountInvalid');
  }

  const addressError = validateAddress(address, t, 'manualPayment');
  if (addressError) errors.address = addressError;

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    value: { fullName, accountIdentifier, address },
  };
}

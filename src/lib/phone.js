/*
|--------------------------------------------------------------------------
| Phone Helpers
|--------------------------------------------------------------------------
| Palestinian mobile numbers: 9 local digits (e.g. 598 304 517),
| displayed in 3-3-3 groups.
*/

export const LOCAL_DIGITS = 9;

/** Strip everything but digits, normalize common prefixes, and cap locally. */
export function toLocalDigits(value) {
  let digits = String(value).replace(/\D/g, '');

  if (digits.startsWith('00970')) {
    digits = digits.slice(5);
  } else if (digits.startsWith('970')) {
    digits = digits.slice(3);
  }

  if (digits.startsWith('0')) digits = digits.slice(1);

  return digits.slice(0, LOCAL_DIGITS);
}

/** Palestinian mobile wallet numbers are 9 local digits and start with 5. */
export function isPalestinianMobileNumber(value) {
  return /^5\d{8}$/.test(toLocalDigits(value));
}

/**
 * Format local digits with spacing: "598304517" -> "598 304 517".
 *
 * @param {string} value Raw input (digits or already-formatted)
 * @returns {string}
 */
export function formatLocalPhone(value) {
  const digits = toLocalDigits(value);
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)];
  return groups.filter(Boolean).join(' ');
}

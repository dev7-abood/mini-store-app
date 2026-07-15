/*
|--------------------------------------------------------------------------
| Phone Helpers
|--------------------------------------------------------------------------
| Palestinian mobile numbers: 9 local digits (e.g. 598 304 517),
| displayed in 3-3-3 groups.
*/

export const LOCAL_DIGITS = 9;

/** Strip everything but digits and cap at the local length. */
export function toLocalDigits(value) {
  return String(value).replace(/\D/g, '').slice(0, LOCAL_DIGITS);
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

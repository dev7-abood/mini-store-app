/**
 * Copy a value to the clipboard, with a fallback for the older WebViews
 * Telegram still runs on some devices, where `navigator.clipboard` is
 * missing or blocked outside a secure context.
 *
 * @param {string|number} value
 * @returns {Promise<void>} rejects when the copy could not be performed
 */
export async function copyToClipboard(value) {
  const text = String(value ?? '');

  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  /* Off-screen but focusable: iOS refuses to select a hidden node. */
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) throw new Error('copy command rejected');
  } finally {
    document.body.removeChild(textarea);
  }
}

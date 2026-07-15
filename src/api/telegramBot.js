/*
|--------------------------------------------------------------------------
| Order Message Sender (client side)
|--------------------------------------------------------------------------
| Posts the formatted order message to our Vercel serverless function
| (/api/telegram-order). The route validates initData and talks to the
| Bot API with the server-side BOT_TOKEN — the token never reaches the
| browser.
*/

/** Raw initData string straight from the Telegram SDK (empty in browser). */
function telegramInitData() {
  if (typeof window === 'undefined') return '';
  return window.Telegram?.WebApp?.initData ?? '';
}

/**
 * Send the order-details message to the Telegram chat(s).
 * Fire-and-forget: failures are logged, never thrown.
 *
 * @param {string} message HTML-formatted order message
 * @returns {Promise<boolean>} true when the server confirmed delivery
 */
export async function sendOrderToChat(message) {
  try {
    const response = await fetch('/api/telegram-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: telegramInitData(), message }),
    });
    const data = await response.json();
    if (!data.ok) console.warn('Order message not delivered:', data.error ?? response.status);
    return Boolean(data.ok);
  } catch (error) {
    console.warn('Order message request failed:', error);
    return false;
  }
}

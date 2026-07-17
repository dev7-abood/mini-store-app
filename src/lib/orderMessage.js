/*
|--------------------------------------------------------------------------
| Order Message Builder
|--------------------------------------------------------------------------
| Formats the confirmed order as an HTML Telegram message, with all
| strings pulled from i18n so the template localises with the app.
*/
import i18n from '../i18n';

/** Escape user-provided text for Telegram's HTML parse mode. */
function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Build the order-details message.
 *
 * @param {{
 *   orderNumber: string,
 *   entries: Array<{product: import('../data/menu').Product, qty: number}>,
 *   subtotal: number,
 *   deliveryFee: number,
 *   total: number,
 *   details: {name: string, address: string, note: string},
 *   phone: string,
 *   deliveryPhone: string,
 * }} order
 * @returns {string} HTML message body
 */
export function buildOrderMessage(order) {
  const t = i18n.t.bind(i18n);
  const money = (amount) => t('common.currency', { amount });

  const lines = order.entries.map(
    ({ product, qty }) => `• ${escapeHtml(product.name)} ×${qty} — ${money(product.price * qty)}`,
  );

  const parts = [
    `🍽️ <b>${t('botMessage.title', { number: order.orderNumber })}</b>`,
    '',
    `🧾 <b>${t('botMessage.items')}:</b>`,
    ...lines,
    '',
    `${t('cart.subtotal')}: ${money(order.subtotal)}`,
    `${t('cart.delivery')}: ${money(order.deliveryFee)}`,
    `<b>${t('cart.total')}: ${money(order.total)}</b>`,
    '',
    `👤 ${t('botMessage.customer')}: ${escapeHtml(order.details.name)}`,
    `📍 ${t('botMessage.address')}: ${escapeHtml(order.details.address)}`,
    `📞 ${t('botMessage.phone')}: ${escapeHtml(order.phone)}`,
  ];

  /* Show the delivery contact only when it differs from the main phone. */
  if (order.deliveryPhone && order.deliveryPhone !== order.phone) {
    parts.push(`🛵 ${t('botMessage.deliveryPhone')}: ${escapeHtml(order.deliveryPhone)}`);
  }

  if (order.details.note.trim()) {
    parts.push(`📝 ${t('botMessage.note')}: ${escapeHtml(order.details.note)}`);
  }

  return parts.join('\n');
}

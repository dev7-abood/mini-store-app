/*
|--------------------------------------------------------------------------
| Order Message Builder
|--------------------------------------------------------------------------
| Formats the confirmed order as an HTML Telegram message, with all
| strings pulled from i18n so the template localises with the app.
*/
import i18n from '../i18n';
import { formatMoney } from './money';

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
 * Every amount is the server's own, already rounded to 2 decimals — the
 * builder formats, it never computes. An amount the backend hasn't sent
 * is left out of the message rather than guessed.
 *
 * @param {{
 *   orderNumber: string,
 *   entries: Array<{product: import('../data/menu').Product,
 *                    priceOption: {name: string}|null, qty: number,
 *                    lineTotal: number|null}>,
 *   subtotal: number|null,
 *   deliveryFee: number|null,
 *   total: number|null,
 *   details: {name: string, address: string, note: string},
 *   phone: string,
 *   deliveryPhone: string,
 *   paymentMethodLabel?: string,
 *   paymentStatus?: string,
 * }} order
 * @returns {string} HTML message body
 */
export function buildOrderMessage(order) {
  const t = i18n.t.bind(i18n);
  /** @returns {string|null} null when the server sent no such amount. */
  const money = (amount) => {
    const formatted = formatMoney(amount);
    return formatted === null ? null : t('common.currency', { amount: formatted });
  };

  const lines = order.entries.map(({ product, priceOption, qty, lineTotal }) => {
    const label = priceOption ? `${product.name} (${priceOption.name})` : product.name;
    const amount = money(lineTotal);
    /* The line's own server total; omitted while the cart is unpriced. */
    return `• ${escapeHtml(label)} ×${qty}${amount ? ` — ${amount}` : ''}`;
  });

  const totalLines = [
    [t('cart.subtotal'), money(order.subtotal), false],
    [t('cart.delivery'), money(order.deliveryFee), false],
    [t('cart.total'), money(order.total), true],
  ]
    .filter(([, amount]) => amount !== null)
    .map(([label, amount, strong]) =>
      (strong ? `<b>${label}: ${amount}</b>` : `${label}: ${amount}`));

  const parts = [
    `🍽️ <b>${t('botMessage.title', { number: order.orderNumber })}</b>`,
    '',
    `🧾 <b>${t('botMessage.items')}:</b>`,
    ...lines,
    '',
    ...totalLines,
    '',
    `👤 ${t('botMessage.customer')}: ${escapeHtml(order.details.name)}`,
    `📍 ${t('botMessage.address')}: ${escapeHtml(order.details.address)}`,
    `📞 ${t('botMessage.phone')}: ${escapeHtml(order.phone)}`,
  ];

  /* Show the delivery contact only when it differs from the main phone. */
  if (order.deliveryPhone && order.deliveryPhone !== order.phone) {
    parts.push(`🛵 ${t('botMessage.deliveryPhone')}: ${escapeHtml(order.deliveryPhone)}`);
  }

  if (order.paymentMethodLabel) {
    parts.push(`${t('botMessage.paymentMethod')}: ${escapeHtml(order.paymentMethodLabel)}`);
  }

  if (order.paymentStatus) {
    parts.push(`${t('botMessage.paymentStatus')}: ${escapeHtml(order.paymentStatus)}`);
  }

  if (order.details.note.trim()) {
    parts.push(`📝 ${t('botMessage.note')}: ${escapeHtml(order.details.note)}`);
  }

  return parts.join('\n');
}

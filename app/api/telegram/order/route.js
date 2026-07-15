/*
|--------------------------------------------------------------------------
| POST /api/telegram/order
|--------------------------------------------------------------------------
| Server-side sender for the order-details message. The bot token lives
| only here (process.env.BOT_TOKEN — no public prefix, never bundled).
|
| Flow:
|   1. Validate the Telegram initData HMAC with the bot token — this
|      proves the request really came from our Mini App inside Telegram
|      and gives us the trusted user id.
|   2. Send the message to the customer's chat.
|   3. Optionally copy the restaurant chat (ADMIN_CHAT_ID).
*/
import crypto from 'node:crypto';

const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ?? '';

/**
 * Validate initData per Telegram's algorithm and return the user object.
 *
 * @param {string} initData Raw query string from window.Telegram.WebApp.initData
 * @returns {{id: number, first_name?: string, username?: string} | null}
 */
function validateInitData(initData) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'))) {
    return null;
  }

  try {
    return JSON.parse(params.get('user') ?? 'null');
  } catch {
    return null;
  }
}

/** Send one HTML message through the Bot API. */
async function sendMessage(chatId, html) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML' }),
  });
  return response.json();
}

export async function POST(request) {
  if (!BOT_TOKEN) {
    return Response.json({ ok: false, error: 'BOT_TOKEN is not configured' }, { status: 500 });
  }

  const { initData, message } = await request.json().catch(() => ({}));

  if (!message || typeof message !== 'string') {
    return Response.json({ ok: false, error: 'message is required' }, { status: 400 });
  }

  const user = validateInitData(initData);
  if (!user?.id) {
    /* Reject unverified callers — otherwise anyone could use this route
       to make the bot message arbitrary chats. */
    return Response.json({ ok: false, error: 'invalid initData' }, { status: 401 });
  }

  const jobs = [sendMessage(user.id, message)];
  if (ADMIN_CHAT_ID) jobs.push(sendMessage(ADMIN_CHAT_ID, message));

  const results = await Promise.allSettled(jobs);
  const delivered = results.some((r) => r.status === 'fulfilled' && r.value?.ok);

  return Response.json({ ok: delivered });
}

/*
|--------------------------------------------------------------------------
| POST /api/telegram-order  (Vercel Serverless Function)
|--------------------------------------------------------------------------
| Server-side sender for the order-details message. Lives OUTSIDE the
| Vite bundle — Vercel deploys every file in /api as a Node function, so
| BOT_TOKEN (no public prefix) never reaches the browser.
|
| Flow:
|   1. Validate the Telegram initData HMAC with the bot token — proves
|      the request came from our Mini App inside Telegram and yields the
|      trusted user id.
|   2. Send the message to the customer's chat.
|   3. Optionally copy the restaurant chat (ADMIN_CHAT_ID).
|
| Local note: `npm run dev` (plain Vite) doesn't serve this function.
| Use `npx vercel dev` to run it locally, or test on the deployment.
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

  try {
    if (!crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'))) {
      return null;
    }
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: 'BOT_TOKEN is not configured' });
  }

  const { initData, message } = req.body ?? {};

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ ok: false, error: 'message is required' });
  }

  const user = validateInitData(initData);
  if (!user?.id) {
    /* Reject unverified callers — otherwise anyone could use this route
       to make the bot message arbitrary chats. */
    return res.status(401).json({ ok: false, error: 'invalid initData' });
  }

  const jobs = [sendMessage(user.id, message)];
  if (ADMIN_CHAT_ID) jobs.push(sendMessage(ADMIN_CHAT_ID, message));

  const results = await Promise.allSettled(jobs);
  const delivered = results.some((r) => r.status === 'fulfilled' && r.value?.ok);

  return res.status(200).json({ ok: delivered });
}

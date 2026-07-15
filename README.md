# سفرة — Telegram Mini App (React + Vite)

Food-ordering Telegram Mini App built with React (Vite). The order-message sender runs as a **Vercel serverless function** so the bot token stays server-side.

## Stack

- **React 18 + Vite** — plain SPA, no SSR
- **react-i18next** — Arabic-only today, structured so adding a second language is a JSON file away
- **CSS Modules** + design tokens in `src/styles/global.css`
- **Context + useReducer** for the cart, dedicated contexts for order details and the screen flow
- **Telegram WebApp SDK** wrapped in `useTelegram` (haptics, alerts, `sendData`, native BackButton, user info)
- **`api/telegram-order.js`** — Vercel Node function: validates initData HMAC, sends the order message via the Bot API

## Structure

```
api/telegram-order.js      # serverless sender (BOT_TOKEN lives here only)
index.html                 # lang/dir, Tajawal font, Telegram SDK script
src/
├── api/                   # client.js (Laravel), telegramBot.js (calls /api/telegram-order)
├── components/            # feature components (+ ui/ primitives)
├── context/               # CartContext, OrderContext, NavigationContext
├── data/menu.js           # static catalog seed (swap for fetchCatalog())
├── hooks/                 # useTelegram, useMoney
├── i18n/                  # i18next bootstrap + locales/ar.json
├── lib/                   # orderMessage.js, phone.js
├── screens/               # one component per flow screen
└── styles/global.css      # tokens + resets
```

## Environment

```env
BOT_TOKEN=123456789:AA...   # no VITE_ prefix -> server-only (the /api function)
ADMIN_CHAT_ID=              # optional restaurant chat — server-only
VITE_API_BASE_URL=          # Laravel API (public URL, safe in the bundle)
```

Set `BOT_TOKEN` / `ADMIN_CHAT_ID` in **Vercel → Settings → Environment Variables** for the deployment.

## Run

```bash
npm install
npm run dev          # http://localhost:3000 — UI only (no /api function)
npx vercel dev       # UI + the /api/telegram-order function locally
npm run build        # production build in dist/
```

Deploying to Vercel: the included `vercel.json` sets the **Vite** preset (output `dist/` — matches the default). The `/api` folder is deployed automatically as serverless functions alongside the static build.

To test inside Telegram, use your `https://....vercel.app` URL in BotFather (or `ngrok http 3000` for local UI testing).

## Order message to the Telegram chat

After OTP verification the app:

1. Calls **`tg.sendData()`** with the raw JSON payload for your Nutgram `onWebAppData` handler (fires only for keyboard-button launches).
2. POSTs the formatted HTML message to **`/api/telegram-order`**. The function **validates the initData HMAC** with the bot token (only genuine Mini App sessions pass), extracts the trusted user id, messages the customer's chat, and copies `ADMIN_CHAT_ID` if set.

## Welcome greeting

The menu header greets the user by `first_name` (falling back to `@username`) from `tg.initDataUnsafe.user`. Fine for a greeting — the serverless function trusts only **validated** initData.

## Wiring the Laravel backend

1. Set `VITE_API_BASE_URL` in `.env` (and on Vercel).
2. Replace the static seed in `src/data/menu.js` with `fetchCatalog()` from `src/api/client.js` (same shape).
3. In `PhoneScreen` / `OtpScreen`, swap the demo `000000` flow for `sendOtp()` / `verifyOtp()`.
4. Every request carries the raw `initData` in the `X-Telegram-Init-Data` header for your HMAC validation middleware.

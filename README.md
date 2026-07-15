# سفرة — Telegram Mini App (Next.js)

Food-ordering Telegram Mini App built with Next.js (App Router), converted from the original single-file HTML prototype.

## Stack

- **Next.js 14 (App Router)** — the Mini App itself is fully client-side (`ssr: false`), while API routes give us a real server for secrets
- **react-i18next** — Arabic-only today, structured so adding a second language is a JSON file away
- **CSS Modules** + design tokens in `app/globals.css`
- **Context + useReducer** for the cart, dedicated contexts for order details and the screen flow
- **Telegram WebApp SDK** wrapped in `useTelegram` (haptics, alerts, `sendData`, native BackButton, user info)

## Structure

```
app/
├── layout.jsx                  # html lang/dir, Tajawal font, Telegram SDK script
├── page.jsx                    # loads the app client-side (ssr: false)
├── globals.css                 # tokens + resets
└── api/telegram/order/route.js # server-side order-message sender (BOT_TOKEN lives here)
src/
├── api/                        # client.js (Laravel via /backend proxy), telegramBot.js
├── components/                 # feature components (+ ui/ primitives)
├── context/                    # CartContext, OrderContext, NavigationContext
├── data/menu.js                # static catalog seed (swap for fetchCatalog())
├── hooks/                      # useTelegram, useMoney
├── i18n/                       # i18next bootstrap + locales/ar.json
├── lib/orderMessage.js         # HTML order-message builder
└── screens/                    # one component per flow screen
```

## Environment (.env — no public prefixes)

```env
BOT_TOKEN=123456789:AA...   # from @BotFather — server-side only, never bundled
ADMIN_CHAT_ID=              # optional restaurant chat (copy of every order)
API_BASE_URL=               # Laravel API, proxied via /backend/* rewrite
```

Because none of these use a public prefix, **none of them are shipped to the browser**. The bot token is only read inside `app/api/telegram/order/route.js`.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

To test inside Telegram, expose port 3000 over HTTPS (e.g. `ngrok http 3000`) and set the URL in BotFather / your bot's WebApp button.

## Order message to the Telegram chat

After OTP verification the app:

1. Calls **`tg.sendData()`** with the raw JSON payload for your Nutgram `onWebAppData` handler (fires only for keyboard-button launches).
2. POSTs the formatted HTML message to **`/api/telegram/order`**. The route **validates the initData HMAC** with the bot token (so only genuine Mini App sessions can trigger it), extracts the trusted user id, sends the message to the customer's chat, and copies `ADMIN_CHAT_ID` if set.

## Welcome greeting

The menu header greets the user by `first_name` (falling back to `@username`) from `tg.initDataUnsafe.user`. Fine for a greeting — but the server route trusts only the **validated** initData, never the unsafe object.

## Wiring the Laravel backend

1. Set `API_BASE_URL` in `.env` — the browser calls same-origin `/backend/...` and Next proxies it.
2. Replace the static seed in `src/data/menu.js` with `fetchCatalog()` from `src/api/client.js` (same shape).
3. In `PhoneScreen` / `OtpScreen`, swap the demo `000000` flow for `sendOtp()` / `verifyOtp()`.
4. Every request already carries the raw `initData` in the `X-Telegram-Init-Data` header for your HMAC validation middleware.

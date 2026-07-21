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


## Storefront endpoint (integrated): GET /front-data

The app consumes your live Laravel endpoint (`FrontDataController@index`, behind `telegram.initdata`) at:

```
{tenant_base_url}/api/v1/front-data?page=N
```

Real payload shape (matches the current tenant response exactly):

```json
{
  "success": true,
  "data": [
    {
      "id": 6, "name": "حلويات", "slug": "desserts",
      "image": "https://r-gaza-restaurant-storage.s3.amazonaws.com/tenanttest/seed/storefront/catalogs/desserts.jpg",
      "active": true,
      "products": [
        {
          "id": 13, "catalog_id": 6, "name": "تشيز كيك كنافة",
          "description": "تشيز كيك كريمي مع طبقة كنافة",
          "image": "https://r-gaza-restaurant-storage.s3.amazonaws.com/tenanttest/seed/storefront/products/kunafa-cheesecake.jpg",
          "price": 18, "discount": 0, "final_price": 18, "available": true
        }
      ]
    }
  ],
  "meta": { "page": 1, "per_page": 9, "total": 14, "has_more": true }
}
```

How the app handles it:

- **Infinite scroll**: page 1 renders immediately on menu mount; an `IntersectionObserver` sentinel 300px above the viewport bottom fires `loadMore()` as the user scrolls, fetching the next page and merging (with id dedupe) as it arrives. Skeleton cards show at the bottom of the grid while a page is in flight. Stops on `has_more: false`.
- **Prices**: all money math uses `final_price`; when `discount > 0` the original `price` shows struck-through on the card and the product sheet.
- **Visuals**: the backend has no emoji/tint — cards rotate through the brand tint palette and use a 🍽️ fallback while S3 images load.
- **Base URL**: resolved from `tenants.json` by matching the launching bot's id against the signed initData (`src/lib/botIdentity.js`) — no per-bot parameters needed. The matched URL gets `/api/v1` appended (override via `VITE_API_PREFIX`).
- **delivery_fee**: not in the response yet — the app falls back to 10 and will automatically pick up `meta.delivery_fee` if you add it.

## Loading behavior

- Splash waits for the real catalog request (min 900ms branding, skip button at 2.5s, hard guard at 6s).
- The menu grid shows shimmer skeletons while loading.
- No backend configured, empty catalog, or a failed/timed-out request (8s) → the app shows an error screen with a retry button. Tenant data only — never fake data.



## Tenant registry (public/tenants.json)

One deployment serves many bots. The static registry maps each bot to its tenant backend:

```json
{
  "tenants": [
    {
      "telegram_bot_id": 1112563,
      "tenant_base_url": "https://exsample.com",
      "telegram_name": "o2"
    }
  ]
}
```

**No per-bot URL parameter needed.** Telegram's initData has no bot_id field,
but since Bot API 7.10 it carries an Ed25519 `signature` whose signed
data-check-string is prefixed with `{bot_id}:WebAppData`. The app tests each
registry id against the signature using Telegram's public keys
(`src/lib/botIdentity.js`) — the id that verifies is cryptographically proven to
be the launching bot. Purely local, ~1ms per tenant, unforgeable. Fallbacks, in
order: `?bot=` URL param (manual override) → `initDataUnsafe.bot_id` →
CloudStorage from a previous launch (covers pre-7.10 clients).

Resolution order for the API base URL: **registry → deep-link payload → CloudStorage → `VITE_API_BASE_URL` → demo/OpenFromBot**. The matched base URL gets `/api/v1` appended (VITE_API_PREFIX). The registry is public routing data only — authentication stays with the initData HMAC middleware on each tenant.

## Multi-tenant bootstrap (deep links)

Launch sequence — zero extra network requests:

```
App opens
  ├─ decode start_param locally ............... 0 requests
  ├─ configureApiClient(payload.u, payload.b) . 0 requests
  ├─ save payload to Telegram CloudStorage .... 0 requests to YOUR servers
  └─ first API call (the catalog) ............. 1 request — the one you needed anyway
        └─ VerifyTelegramInitData middleware → authentic user + authentic payload
```

- `src/lib/decodeTelegramPayload.js` — Base64URL + XOR with `VITE_TELEGRAM_DEEP_LINK_KEY` (must equal `TELEGRAM_DEEP_LINK_KEY` on the backend).
- `src/lib/tenantContext.js` — deep link → CloudStorage (`tenant_ctx_v1`) → null.
- `src/context/TenantContext.jsx` — resolves before anything loads. Fallbacks: `VITE_API_BASE_URL` (single-tenant/dev) → OpenFromBot screen, no requests made.
- The API client appends `/api` to `payload.u` and sends `X-Branch-Id` when `payload.b` is present; every request carries the raw initData for the middleware.
- Trust model: the payload routes, the HMAC proves. Since `start_param` is inside the signed initData, a forged payload dies at the first request.

Backend encode helper (mirror of the frontend decoder):

```php
/**
 * Base64URL( XOR( JSON, key ) ) — reversible obfuscation for start_param.
 *
 * @param  array<string, mixed>  $payload  e.g. ['u' => $tenantUrl, 'b' => $branchId]
 */
function encodeTelegramPayload(array $payload, string $key): string
{
    $json  = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $bytes = '';

    foreach (str_split($json) as $i => $char) {
        $bytes .= chr(ord($char) ^ ord($key[$i % strlen($key)]));
    }

    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

// Deep link: https://t.me/{$botUsername}/{$appShortName}?startapp={encodeTelegramPayload(...)}
```

> Multi-tenant note on the order message: the Vercel function `api/telegram-order.js` supports a single `BOT_TOKEN`, so use it only for staging/single-bot setups. In production multi-tenant, send the order message from the **tenant backend** — it owns each restaurant's token (central `telegram_settings`) and already receives the verified user via the middleware.

## Order message to the Telegram chat

After OTP verification the app:

1. Calls **`tg.sendData()`** with the raw JSON payload for your Nutgram `onWebAppData` handler (fires only for keyboard-button launches).
2. POSTs the formatted HTML message to **`/api/telegram-order`**. The function **validates the initData HMAC** with the bot token (only genuine Mini App sessions pass), extracts the trusted user id, messages the customer's chat, and copies `ADMIN_CHAT_ID` if set.

## Welcome greeting

The menu header greets the user by `first_name` (falling back to `@username`) from `tg.initDataUnsafe.user`. Fine for a greeting — the serverless function trusts only **validated** initData.

## Wiring the Laravel backend

1. Set `VITE_API_BASE_URL` in `.env` (and on Vercel).
2. The catalog is already wired — implement `GET /catalog` per the contract above and it goes live automatically.
3. In `PhoneScreen` / `OtpScreen`, swap the demo `000000` flow for `sendOtp()` / `verifyOtp()`.
4. Every request carries the raw `initData` in the `X-Telegram-Init-Data` header for your HMAC validation middleware.

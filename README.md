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


## Catalog API contract (build this in Laravel)

`GET {VITE_API_BASE_URL}/catalog` — the app normalizes this response (accepts `category_id` or `category`, `desc` or `description`):

```json
{
  "delivery_fee": 10,
  "categories": [
    {
      "id": "burgers",
      "name": "برجر",
      "emoji": "🍔",
      "tint": "#FBE3C9",
      "image": "https://cdn.example.com/categories/burgers.jpg"
    }
  ],
  "products": [
    {
      "id": 1,
      "category_id": "burgers",
      "name": "سماش كلاسيك",
      "desc": "لحم سماش دبل مع شيدر وصوص البيت",
      "price": 32,
      "emoji": "🍔",
      "image": "https://cdn.example.com/products/smash.jpg"
    }
  ]
}
```

Notes:
- `id` can be int or string for categories; product `id` must be numeric (used as the cart key and in the order payload).
- `emoji` and `tint` are optional (defaults: 🍽️ / #F3E8D5). `image` optional — the emoji shows as fallback.
- Sort order in the arrays = display order in the app.
- **CORS**: allow your Vercel origin in `config/cors.php` (paths `api/*`, allowed_origins: `https://your-app.vercel.app`).
- The app sends `X-Telegram-Init-Data` on every request — plug in your existing initData HMAC middleware.

Minimal Laravel sketch:

```php
// routes/api.php
Route::prefix('mini-app')->group(function () {
    Route::get('catalog', CatalogController::class);
});

// app/Http/Controllers/CatalogController.php
public function __invoke(): JsonResponse
{
    return response()->json([
        'delivery_fee' => (int) Setting::get('delivery_fee', 10),
        'categories'   => CategoryResource::collection(
            Category::query()->where('is_active', true)->orderBy('sort')->get()
        ),
        'products'     => ProductResource::collection(
            Product::query()->where('is_active', true)->orderBy('sort')->get()
        ),
    ]);
}
```

## Loading behavior

- Splash waits for the real catalog request (min 900ms branding, skip button at 2.5s, hard guard at 6s).
- The menu grid shows shimmer skeletons while loading.
- No `VITE_API_BASE_URL`, empty catalog, or a failed/timed-out request (8s) → the app falls back to the built-in seed in `src/data/menu.js`, so it never breaks in front of a customer. Check the console for `source: 'static'` warnings.


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
- `src/context/TenantContext.jsx` — resolves before anything loads. Fallbacks: `VITE_API_BASE_URL` (single-tenant/dev) → browser demo mode (seed catalog) → in Telegram with nothing: the **OpenFromBot** screen, no requests made.
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

/*
|--------------------------------------------------------------------------
| API Client (Laravel Backend)
|--------------------------------------------------------------------------
| The backend base URL comes from VITE_API_BASE_URL — it's a public
| endpoint (not a secret), so exposing it in the bundle is fine. Every
| request forwards Telegram's raw `initData` so the Laravel middleware
| can run its HMAC validation.
|
| Endpoints expected on the Laravel side (see README for the contract):
|   GET  /front-data     -> { success, data: [catalog + products], meta }
|   POST /orders         -> { order_number: "SF-1024" }
|   POST /otp/send       -> { ok: true }
|   POST /otp/verify     -> { ok: true }
*/

/*
|--------------------------------------------------------------------------
| Runtime Configuration (multi-tenant)
|--------------------------------------------------------------------------
| The base URL is decided at LAUNCH from the deep-link payload
| (configureApiClient), falling back to VITE_API_BASE_URL for
| single-tenant / local development. X-Branch-Id is attached when the
| payload carries a branch.
*/

/** Path prefix appended to the tenant URL from the deep-link payload. */
const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? '/api/v1';

let runtimeBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
let runtimeBranchId = null;

/**
 * Point the client at the resolved tenant: `{u}/api/v1` (prefix
 * overridable via VITE_API_PREFIX). Called once at bootstrap, before
 * any data request. Never send the decoded payload as proof of
 * anything — the initData signature is the proof.
 *
 * @param {{u: string, b?: number}} ctx Decoded deep-link payload
 */
export function configureApiClient(ctx) {
  runtimeBaseUrl = `${ctx.u.replace(/\/$/, '')}${API_PREFIX}`;
  runtimeBranchId = ctx.b ?? null;
}

/** Whether a backend is configured at all. */
export const hasBackend = () => Boolean(runtimeBaseUrl);

/** The branch resolved from the deep link (null when none). */
export const currentBranchId = () => runtimeBranchId;

/** Raw initData string straight from the Telegram SDK (empty in browser). */
function telegramInitData() {
  if (typeof window === 'undefined') return '';
  return window.Telegram?.WebApp?.initData ?? '';
}

/**
 * Perform a JSON request against the backend.
 *
 * @param {string} path
 * @param {RequestInit & {timeoutMs?: number}} [options]
 * @returns {Promise<any>}
 */
async function request(path, { timeoutMs = 10000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${runtimeBaseUrl}${path}`, {
      signal: controller.signal,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Telegram-Init-Data': telegramInitData(),
        ...(runtimeBranchId != null ? { 'X-Branch-Id': String(runtimeBranchId) } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/*
|--------------------------------------------------------------------------
| Storefront Catalog (GET /front-data)
|--------------------------------------------------------------------------
| Laravel returns catalogs embedding their products, paginated at the
| PRODUCT level (9 on page 1, then 6 per page) and grouped per page:
|
|   { success, data: [ {id, name, slug, image, products: [...]} ],
|     meta: { page, per_page, total, has_more } }
|
| Products carry price / discount / final_price — the app uses
| final_price everywhere money is computed and keeps the original for
| strikethrough display.
*/

/** Rotating card tints — the backend has no per-catalog color. */
const CATALOG_TINTS = ['#FBE3C9', '#FADFD5', '#F0E6CF', '#FBF0C9', '#D9EDE0', '#F6DDE7'];

/**
 * Normalize one /front-data page to the app's internal shape.
 *
 * @param {any} data Raw response body
 * @param {number} page The requested page (meta echo may be absent)
 * @returns {{categories: object[], products: object[], hasMore: boolean, deliveryFee: number|null}}
 */
function normalizeFrontData(data, page) {
  const catalogs = Array.isArray(data?.data) ? data.data : [];

  const categories = catalogs.map((catalog, index) => ({
    id: String(catalog.id),
    name: String(catalog.name ?? ''),
    fallback: '🍽️',
    tint: CATALOG_TINTS[index % CATALOG_TINTS.length],
    image: catalog.image ?? '',
  }));

  const products = catalogs.flatMap((catalog) =>
    (catalog.products ?? []).map((p) => {
      const original = Number(p.price ?? 0);
      const discount = Number(p.discount ?? 0);
      return {
        id: Number(p.id),
        category: String(p.catalog_id ?? catalog.id),
        name: String(p.name ?? ''),
        desc: String(p.description ?? ''),
        /* Money everywhere in the app = the price actually charged. */
        price: Number(p.final_price ?? Math.max(original - discount, 0)),
        originalPrice: original,
        discount,
        fallback: '🍽️',
        image: p.image ?? '',
      };
    }),
  );

  const fee = Number(data?.meta?.delivery_fee);

  return {
    categories,
    products,
    hasMore: Boolean(data?.meta?.has_more),
    page: Number(data?.meta?.page ?? page),
    deliveryFee: Number.isFinite(fee) ? fee : null,
  };
}

/**
 * Fetch one storefront page.
 *
 * @param {number} [page]
 */
export async function fetchFrontData(page = 1) {
  const data = await request(`/front-data?page=${page}`, { timeoutMs: 8000 });

  if (data?.success === false) {
    throw new Error('front-data returned success: false');
  }

  return normalizeFrontData(data, page);
}

/*
|--------------------------------------------------------------------------
| Orders & OTP
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Branding (GET /telegram/branding)
|--------------------------------------------------------------------------
| The tenant's Mini App theme: name, tagline, colors, logo. Public.
| Returns null on failure so the app keeps its default (سفرة) palette.
*/

/**
 * Fetch the tenant branding.
 *
 * @returns {Promise<{name: string, tagline: string, primary_color: string,
 *   secondary_color: string, background_color: string, text_color: string,
 *   logo_url: string|null, logo_size: number} | null>}
 */
export async function fetchBranding() {
  try {
    const data = await request('/telegram/branding', { timeoutMs: 6000 });
    return data?.success ? data.data : null;
  } catch (error) {
    console.warn('Branding fetch failed — using defaults:', error);
    return null;
  }
}

/*
|--------------------------------------------------------------------------
| Customer Sync (POST /telegram/customer)
|--------------------------------------------------------------------------
| Registers/refreshes the calling Telegram user as a tenant Customer.
| Identity comes from the verified initData on the backend — the body
| only carries routing (bot_id -> branch) and optional profile fields.
| Returns the customer record, used to pre-fill checkout for returning
| customers.
*/

/**
 * Sync the current Telegram user as a Customer.
 *
 * @param {{botId?: string|null, phone?: string, address?: string}} [options]
 * @returns {Promise<{id: number, branch_id: number, telegram_user_id: string,
 *           username: string|null, phone: string|null, address: string|null,
 *           total_orders: number} | null>} The customer, or null on failure
 */
export async function syncCustomer({ botId = null, phone, address } = {}) {
  try {
    const body = {};
    if (botId) body.bot_id = String(botId);
    if (phone) body.phone = phone;
    if (address) body.address = address;

    const data = await request('/telegram/customer', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 8000,
    });

    return data?.success ? data.data : null;
  } catch (error) {
    console.warn('Customer sync failed:', error);
    return null;
  }
}

/**
 * Submit a confirmed order.
 *
 * @param {{ items: Array<{id: number, qty: number}>, name: string,
 *           address: string, note: string, phone: string, total: number }} payload
 */
export const submitOrder = (payload) =>
  request('/orders', { method: 'POST', body: JSON.stringify(payload) });

/** @param {string} phone E.164 phone number */
export const sendOtp = (phone) =>
  request('/otp/send', { method: 'POST', body: JSON.stringify({ phone }) });

/** @param {string} phone @param {string} code */
export const verifyOtp = (phone, code) =>
  request('/otp/verify', { method: 'POST', body: JSON.stringify({ phone, code }) });

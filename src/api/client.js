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
|   GET  /catalog        -> { delivery_fee, categories: [...], products: [...] }
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

let runtimeBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
let runtimeBranchId = null;

/**
 * Point the client at the resolved tenant. Called once at bootstrap,
 * before any data request. Never send the decoded payload as proof of
 * anything — the initData signature is the proof.
 *
 * @param {{u: string, b?: number}} ctx Decoded deep-link payload
 */
export function configureApiClient(ctx) {
  runtimeBaseUrl = `${ctx.u.replace(/\/$/, '')}/api`;
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
| Catalog
|--------------------------------------------------------------------------
*/

/**
 * Normalize the Laravel payload to the app's internal shape. Accepts a
 * few field aliases (category_id/category, desc/description) so minor
 * backend naming choices don't break the UI.
 *
 * @param {any} data Raw /catalog response
 */
function normalizeCatalog(data) {
  const categories = (data.categories ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? ''),
    fallback: c.emoji ?? '🍽️',
    tint: c.tint ?? '#F3E8D5',
    image: c.image ?? '',
  }));

  const products = (data.products ?? []).map((p) => ({
    id: Number(p.id),
    category: String(p.category_id ?? p.category ?? ''),
    name: String(p.name ?? ''),
    desc: String(p.desc ?? p.description ?? ''),
    price: Number(p.price ?? 0),
    fallback: p.emoji ?? '🍽️',
    image: p.image ?? '',
  }));

  return {
    categories,
    products,
    deliveryFee: Number(data.delivery_fee ?? data.deliveryFee ?? 10),
  };
}

/** Fetch and normalize the live catalog. */
export async function fetchCatalog() {
  const data = await request('/catalog', { timeoutMs: 8000 });
  return normalizeCatalog(data);
}

/*
|--------------------------------------------------------------------------
| Orders & OTP
|--------------------------------------------------------------------------
*/

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

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
      /* Attach the status and the parsed body to the error so callers
         can distinguish 401 (bad initData) from 422 (validation) and
         429 (throttled), and surface the API's own message. */
      const text = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {
        /* non-JSON error body (HTML error page, proxy timeout, ...) */
      }

      const error = new Error(`API ${response.status}: ${text}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
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
| Products carry price / discount / final_price:
|
|   price       — list price
|   discount    — PERCENTAGE (0-100), NOT an amount. The API reports 0
|                 whenever the discount is outside its scheduled window,
|                 so the client can treat "discount > 0" as "on sale now".
|   final_price — what the customer actually pays; authoritative.
|
| The app uses final_price everywhere money is computed and keeps the
| list price for strikethrough display. The local fallback below must
| apply the percentage — subtracting the raw value would undercharge.
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
      /* Percentage, clamped: a malformed value can never invert a price. */
      const discount = Math.min(Math.max(Number(p.discount ?? 0), 0), 100);

      /* Trust final_price when the API sends it; otherwise apply the
         percentage locally (NOT `original - discount`). */
      const apiFinal = Number(p.final_price);
      const charged = Number.isFinite(apiFinal)
        ? apiFinal
        : Math.max(original - (original * discount) / 100, 0);

      return {
        id: Number(p.id),
        category: String(p.catalog_id ?? catalog.id),
        name: String(p.name ?? ''),
        desc: String(p.description ?? ''),
        /* Money everywhere in the app = the price actually charged. */
        price: charged,
        originalPrice: original,
        /* Only true when there is a real saving to show — guards against
           rendering a strikethrough identical to the current price. */
        onSale: discount > 0 && original > charged,
        /* Out of stock: the item is still listed (the merchant wants it
           visible) but cannot be ordered. Only `active: false` products
           are withheld by the API entirely. */
        available: p.available !== false,
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

/*
|--------------------------------------------------------------------------
| Cart (server-persisted)
|--------------------------------------------------------------------------
| Behind `telegram.initdata` + `telegram.customer`, so the customer must
| already be synced before these are called.
|
|   GET    /cart                    -> current cart
|   PUT    /cart                    -> replace the whole cart
|   DELETE /cart                    -> empty it
|   POST   /cart/items              -> add one product
|   PATCH  /cart/items/{product}    -> set a product's quantity
|   DELETE /cart/items/{product}    -> remove a product
|
| Every function resolves to a { [productId]: quantity } map (or null on
| failure) so the caller never deals with transport shapes.
*/

/**
 * Reduce a cart response to { productId: quantity }.
 *
 * Tolerates the common shapes: items under `data.items` or `data`, and
 * a product referenced as `product_id` / `productId` / nested `product.id`,
 * with the amount as `quantity` / `qty`.
 *
 * @param {any} payload
 * @returns {Record<number, number>}
 */
export function normalizeCartItems(payload) {
  const raw = payload?.data?.items ?? payload?.items ?? payload?.data ?? [];
  if (!Array.isArray(raw)) return {};

  const map = {};
  for (const line of raw) {
    const id = Number(
      line?.product_id ?? line?.productId ?? line?.product?.id ?? line?.id,
    );
    const qty = Number(line?.quantity ?? line?.qty ?? 0);
    if (Number.isFinite(id) && id > 0 && qty > 0) {
      map[id] = (map[id] ?? 0) + qty;
    }
  }
  return map;
}

/**
 * Fetch the persisted cart.
 *
 * @returns {Promise<Record<number, number> | null>} null on failure
 */
export async function fetchCart() {
  try {
    return normalizeCartItems(await request('/cart', { timeoutMs: 8000 }));
  } catch (error) {
    console.warn('Cart fetch failed:', error);
    return null;
  }
}

/**
 * Replace the entire server cart (used to reconcile a local cart).
 *
 * @param {Record<number, number>} items
 * @returns {Promise<Record<number, number> | null>}
 */
export async function syncCart(items) {
  try {
    const payload = {
      items: Object.entries(items).map(([productId, quantity]) => ({
        product_id: Number(productId),
        quantity: Number(quantity),
      })),
    };
    return normalizeCartItems(
      await request('/cart', { method: 'PUT', body: JSON.stringify(payload), timeoutMs: 8000 }),
    );
  } catch (error) {
    console.warn('Cart sync failed:', error);
    return null;
  }
}

/**
 * Empty the server cart.
 *
 * @returns {Promise<boolean>} whether the server confirmed
 */
export async function clearCartRemote() {
  try {
    await request('/cart', { method: 'DELETE', timeoutMs: 8000 });
    return true;
  } catch (error) {
    console.warn('Cart clear failed:', error);
    return false;
  }
}

/**
 * Add a product to the cart.
 *
 * @param {number} productId
 * @param {number} quantity
 * @returns {Promise<Record<number, number> | null>}
 */
export async function addCartItem(productId, quantity = 1) {
  try {
    return normalizeCartItems(
      await request('/cart/items', {
        method: 'POST',
        body: JSON.stringify({ product_id: Number(productId), quantity: Number(quantity) }),
        timeoutMs: 8000,
      }),
    );
  } catch (error) {
    console.warn('Cart add failed:', error);
    return null;
  }
}

/**
 * Set a product's quantity.
 *
 * @param {number} productId
 * @param {number} quantity
 * @returns {Promise<Record<number, number> | null>}
 */
export async function updateCartItem(productId, quantity) {
  try {
    return normalizeCartItems(
      await request(`/cart/items/${Number(productId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: Number(quantity) }),
        timeoutMs: 8000,
      }),
    );
  } catch (error) {
    console.warn('Cart update failed:', error);
    return null;
  }
}

/**
 * Remove a product from the cart.
 *
 * @param {number} productId
 * @returns {Promise<Record<number, number> | null>}
 */
export async function removeCartItem(productId) {
  try {
    return normalizeCartItems(
      await request(`/cart/items/${Number(productId)}`, { method: 'DELETE', timeoutMs: 8000 }),
    );
  } catch (error) {
    console.warn('Cart remove failed:', error);
    return null;
  }
}

/*
|--------------------------------------------------------------------------
| Checkout & Orders
|--------------------------------------------------------------------------
| Behind `telegram.initdata` + `telegram.customer`.
|
|   GET    /checkout                     -> price the basket (no mutation)
|   POST   /checkout                     -> cart => unverified order + OTP
|   GET    /orders                       -> the customer's orders
|   GET    /orders/{n}                   -> one order
|   POST   /orders/{n}/cancel            -> cancel
|   POST   /orders/{n}/verify   {code}   -> confirm the phone OTP
|   POST   /orders/{n}/resend            -> re-send the OTP
|   GET    /orders/{n}/payment           -> payment state (polled)
|   POST   /orders/{n}/payment/retry     -> new payment attempt
|
| Each helper returns { ok, data, message, status } so screens can react
| to validation errors and throttling (429) without try/catch.
*/

/**
 * Envelope for order-flow calls: never throws, always reports why.
 *
 * @param {string} path
 * @param {{method?: string, body?: any, timeoutMs?: number}} [options]
 * @returns {Promise<{ok: boolean, data: any, message: string|null, status: number|null}>}
 */
async function orderRequest(path, options = {}) {
  try {
    const payload = await request(path, {
      timeoutMs: 10000,
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return {
      ok: payload?.success !== false,
      data: payload?.data ?? payload ?? null,
      message: payload?.message ?? null,
      status: 200,
    };
  } catch (error) {
    const status = Number(error?.status) || null;
    console.warn(`Order request failed (${path}):`, error);
    return {
      ok: false,
      data: null,
      /* Surface the API's own message when it sent one. */
      message: error?.payload?.message ?? error?.message ?? null,
      status,
    };
  }
}

/**
 * Normalize an order payload into the shape the screens consume.
 *
 * @param {any} raw
 * @returns {object|null}
 */
export function normalizeOrder(raw) {
  const o = raw?.order ?? raw;
  if (!o || typeof o !== 'object') return null;

  return {
    orderNumber: String(o.order_number ?? o.orderNumber ?? o.number ?? o.id ?? ''),
    status: String(o.status ?? 'pending'),
    /* Server-side money is authoritative — never recompute locally. */
    subtotal: Number(o.subtotal ?? 0),
    deliveryFee: Number(o.delivery_fee ?? o.deliveryFee ?? 0),
    total: Number(o.total ?? 0),
    isVerified: Boolean(o.is_verified ?? o.verified ?? false),
    paymentStatus: o.payment?.status ?? o.payment_status ?? null,
    paymentUrl: o.payment?.url ?? o.payment_url ?? null,
    createdAt: o.created_at ?? null,
    items: Array.isArray(o.items) ? o.items : [],
    raw: o,
  };
}

/**
 * Price the current cart without modifying it.
 *
 * @returns {Promise<{ok: boolean, data: any, message: string|null, status: number|null}>}
 */
export const previewCheckout = () => orderRequest('/checkout');

/**
 * Convert the cart into an unverified order; the API dispatches the OTP.
 *
 * @param {{name: string, address: string, phone: string,
 *          delivery_phone?: string, note?: string}} details
 * @returns {Promise<{ok: boolean, data: any, message: string|null, status: number|null}>}
 */
export const placeOrder = (details) =>
  orderRequest('/checkout', { method: 'POST', body: details });

/**
 * @returns {Promise<{ok: boolean, data: any, message: string|null, status: number|null}>}
 */
export const fetchOrders = () => orderRequest('/orders');

/**
 * @param {string} orderNumber
 */
export const fetchOrder = (orderNumber) =>
  orderRequest(`/orders/${encodeURIComponent(orderNumber)}`);

/**
 * @param {string} orderNumber
 */
export const cancelOrder = (orderNumber) =>
  orderRequest(`/orders/${encodeURIComponent(orderNumber)}/cancel`, { method: 'POST' });

/**
 * Verify the phone OTP for an order.
 *
 * @param {string} orderNumber
 * @param {string} code
 */
export const verifyOrder = (orderNumber, code) =>
  orderRequest(`/orders/${encodeURIComponent(orderNumber)}/verify`, {
    method: 'POST',
    body: { code: String(code) },
  });

/**
 * Re-send the OTP (server throttles to 5/min).
 *
 * @param {string} orderNumber
 */
export const resendOrderOtp = (orderNumber) =>
  orderRequest(`/orders/${encodeURIComponent(orderNumber)}/resend`, { method: 'POST' });

/**
 * Payment state — polled while the customer approves in their wallet.
 *
 * @param {string} orderNumber
 */
export const fetchOrderPayment = (orderNumber) =>
  orderRequest(`/orders/${encodeURIComponent(orderNumber)}/payment`, { timeoutMs: 8000 });

/**
 * Start a fresh payment attempt after a decline.
 *
 * @param {string} orderNumber
 */
export const retryOrderPayment = (orderNumber) =>
  orderRequest(`/orders/${encodeURIComponent(orderNumber)}/payment/retry`, { method: 'POST' });

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

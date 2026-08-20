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
import { normalizeBusinessType, pickPlaceholderIcon } from '../lib/businessType';
import { apiPathFromConfirmationUrl } from '../lib/jawwalPayCheckout';
import { normalizeManualPaymentReceivingInfo } from '../lib/paymentMethods';

/** Path prefix appended to the tenant URL from the deep-link payload. */
const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? '/api/v1';

let runtimeBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
let runtimeBranchId = null;
/** @type {import('../lib/businessType').BusinessType | null} */
let runtimeBusinessType = null;

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

/**
 * Configure the resolved tenant business type after the tenant API has
 * completed, or after the registry fallback has been intentionally used.
 *
 * @param {unknown} businessType
 */
export function configureApiBusinessType(businessType) {
  runtimeBusinessType = normalizeBusinessType(businessType);
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
async function jsonRequest(path, { timeoutMs = 10000, ...options } = {}) {
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
    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON response body */
    }

    if (!response.ok) {
      /* Attach the status and the parsed body to the error so callers
         can distinguish 401 (bad initData) from 422 (validation) and
         429 (throttled), and surface the API's own message. */
      const error = new Error(`API ${response.status}: ${text}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return { payload, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

async function request(path, options = {}) {
  const { payload } = await jsonRequest(path, options);
  return payload;
}

/**
 * Multipart request helper for file uploads. Do not set Content-Type here;
 * the browser adds the form-data boundary.
 *
 * @param {string} path
 * @param {RequestInit & {timeoutMs?: number}} [options]
 * @returns {Promise<any>}
 */
async function formRequest(path, { timeoutMs = 15000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${runtimeBaseUrl}${path}`, {
      signal: controller.signal,
      ...options,
      headers: {
        Accept: 'application/json',
        'X-Telegram-Init-Data': telegramInitData(),
        ...(runtimeBranchId != null ? { 'X-Branch-Id': String(runtimeBranchId) } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {
        /* non-JSON error body */
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
  if (!runtimeBusinessType) {
    throw new Error('Catalog data requested before tenant business_type was initialized.');
  }

  const catalogs = Array.isArray(data?.data) ? data.data : [];

  const categories = catalogs.map((catalog, index) => ({
    id: String(catalog.id),
    name: String(catalog.name ?? ''),
    fallback: pickPlaceholderIcon(runtimeBusinessType, 'category', index),
    tint: CATALOG_TINTS[index % CATALOG_TINTS.length],
    image: catalog.image ?? '',
  }));

  let productIconIndex = 0;

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
        fallback: pickPlaceholderIcon(runtimeBusinessType, 'product', productIconIndex++),
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
| Tenant Config (GET /telegram/branding)
|--------------------------------------------------------------------------
| The tenant's Mini App configuration: branding plus business_type.
| Returns null on failure so TenantProvider can choose its registry fallback.
*/

/**
 * Fetch the tenant UI configuration.
 *
 * @returns {Promise<{name: string, tagline: string, primary_color: string,
 *   secondary_color: string, background_color: string, text_color: string,
 *   logo_url: string|null, logo_size: number, business_type?: string} | null>}
 */
export async function fetchTenantConfig() {
  try {
    const data = await request('/telegram/branding', { timeoutMs: 6000 });
    return data?.success ? data.data : null;
  } catch (error) {
    console.warn('Tenant config fetch failed:', error);
    return null;
  }
}

export const fetchBranding = fetchTenantConfig;

/*
|--------------------------------------------------------------------------
| Store Status (GET /telegram/store/status)
|--------------------------------------------------------------------------
| Returns whether the branch is currently open and whether checkout is
| allowed. Checkout is still protected server-side by `store.open`, so
| the UI treats this as guidance and rechecks before placing an order.
*/

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'open', 'opened'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'closed', 'close'].includes(normalized)) return false;
  }
  return fallback;
}

/**
 * Normalize the status endpoint and STORE_CLOSED error payloads into one
 * UI-friendly shape. Unknown/error auth responses must not block checkout;
 * the POST /checkout middleware remains the final source of truth.
 *
 * @param {any} payload
 */
export function normalizeStoreStatus(payload) {
  const body = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const rawStatus = body?.status ?? payload?.status;
  const status = rawStatus && typeof rawStatus === 'object' ? rawStatus : {};
  const error = payload?.error && typeof payload.error === 'object' ? payload.error : {};

  const openSignal =
    body.is_open
    ?? body.isOpen
    ?? body.open
    ?? payload?.is_open
    ?? payload?.isOpen
    ?? payload?.open
    ?? status.is_open
    ?? status.open
    ?? (typeof rawStatus === 'string' ? rawStatus : undefined);
  const checkoutSignal =
    body.can_checkout
    ?? body.canCheckout
    ?? payload?.can_checkout
    ?? payload?.canCheckout;
  const hasOpenSignal = openSignal !== undefined || checkoutSignal !== undefined;
  const closedByCode =
    String(error.code ?? body.code ?? payload?.code ?? '').toUpperCase() === 'STORE_CLOSED';

  const isOpen = hasOpenSignal
    ? toBoolean(openSignal ?? checkoutSignal, false)
    : closedByCode
      ? false
      : null;

  const canCheckout = hasOpenSignal
    ? toBoolean(checkoutSignal ?? openSignal, Boolean(isOpen))
    : closedByCode
      ? false
      : true;

  return {
    isOpen,
    canCheckout,
    acceptPreorders: toBoolean(
      body.accept_preorders
      ?? body.acceptPreorders
      ?? payload?.accept_preorders
      ?? payload?.acceptPreorders
      ?? status.accept_preorders,
      false,
    ),
    message: error.message ?? body.message ?? status.message ?? payload?.message ?? null,
    code: error.code ?? body.code ?? payload?.code ?? null,
    status,
    raw: payload,
  };
}

/**
 * Fetch the branch's open/closed state.
 *
 * @returns {Promise<{isOpen: boolean|null, canCheckout: boolean,
 *   acceptPreorders: boolean, message: string|null, code: string|null,
 *   status: object, raw: any}>}
 */
export async function fetchStoreStatus() {
  try {
    return normalizeStoreStatus(
      await request('/telegram/store/status', { timeoutMs: 6000 }),
    );
  } catch (error) {
    if (error?.payload) {
      return normalizeStoreStatus(error.payload);
    }
    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| Payment Methods (GET /payment-methods)
|--------------------------------------------------------------------------
| Tenant payment settings decide which manual methods are active and which
| receiving details belong to each manual method.
*/

export const fetchPaymentMethods = () =>
  request('/payment-methods', { timeoutMs: 8000 });

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
| Each helper returns { ok, data, message, status, code } so screens can
| react to validation errors, throttling (429), and STORE_CLOSED without
| try/catch.
*/

/**
 * Envelope for order-flow calls: never throws, always reports why.
 *
 * @param {string} path
 * @param {{method?: string, body?: any, timeoutMs?: number}} [options]
 * @returns {Promise<{ok: boolean, data: any, message: string|null,
 *   status: number|null, code?: string|null}>}
 */
async function orderRequest(path, options = {}) {
  try {
    const { payload, status } = await jsonRequest(path, {
      timeoutMs: 10000,
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return {
      ok: payload?.success !== false,
      data: payload?.data ?? payload ?? null,
      message: payload?.message ?? null,
      status,
    };
  } catch (error) {
    const status = Number(error?.status) || null;
    const payload = error?.payload ?? null;
    console.warn(`Order request failed (${path}):`, error);
    return {
      ok: false,
      data: payload?.data ?? null,
      /* Surface the API's own message when it sent one. */
      message: payload?.message ?? payload?.error?.message ?? payload?.error?.description ?? error?.message ?? null,
      status,
      code: payload?.error?.code ?? payload?.code ?? null,
      error: payload?.error ?? null,
    };
  }
}

/**
 * Envelope for multipart order-flow calls.
 *
 * @param {string} path
 * @param {{method?: string, body?: FormData, timeoutMs?: number}} [options]
 * @returns {Promise<{ok: boolean, data: any, message: string|null,
 *   status: number|null, code?: string|null}>}
 */
async function orderFormRequest(path, options = {}) {
  try {
    const payload = await formRequest(path, {
      timeoutMs: 15000,
      ...options,
    });
    return {
      ok: payload?.success !== false,
      data: payload?.data ?? payload ?? null,
      message: payload?.message ?? null,
      status: 200,
    };
  } catch (error) {
    const status = Number(error?.status) || null;
    const payload = error?.payload ?? null;
    console.warn(`Order upload failed (${path}):`, error);
    return {
      ok: false,
      data: payload?.data ?? null,
      message: payload?.message ?? payload?.error?.message ?? payload?.error?.description ?? error?.message ?? null,
      status,
      code: payload?.error?.code ?? payload?.code ?? null,
      error: payload?.error ?? null,
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

  const status = o.status && typeof o.status === 'object' ? o.status : null;
  const payment = o.payment && typeof o.payment === 'object' ? o.payment : null;
  const totals = o.totals && typeof o.totals === 'object' ? o.totals : null;
  const verification = o.verification && typeof o.verification === 'object' ? o.verification : null;
  const proof = payment?.proof && typeof payment.proof === 'object'
    ? payment.proof
    : o.payment_proof && typeof o.payment_proof === 'object'
      ? o.payment_proof
      : o.paymentProof && typeof o.paymentProof === 'object'
        ? o.paymentProof
        : null;
  const receivingInfo = normalizeManualPaymentReceivingInfo(
    payment?.receiving_info
    ?? payment?.receivingInfo
    ?? payment?.receiver
    ?? payment?.destination
    ?? o.payment_receiving_info
    ?? o.paymentReceivingInfo
    ?? o.manual_payment_info
    ?? o.manualPaymentInfo,
  );
  const statusValue = status?.value ?? (status ? null : o.status) ?? 'pending';
  const items = Array.isArray(o.items)
    ? o.items
    : Array.isArray(o.items?.data)
      ? o.items.data
      : [];

  return {
    orderNumber: String(o.order_number ?? o.orderNumber ?? o.number ?? o.id ?? ''),
    id: o.id ?? null,
    status: String(statusValue),
    statusLabel: status?.label ?? null,
    statusDescription: status?.description ?? null,
    statusStep: Number(status?.step ?? 0),
    statusTotalSteps: Number(status?.total_steps ?? status?.totalSteps ?? 0),
    isFinal: Boolean(status?.is_final ?? status?.isFinal ?? false),
    isCancellable: Boolean(status?.is_cancellable ?? status?.isCancellable ?? false),
    verification: {
      required: Boolean(verification?.required ?? false),
      verifiedAt: verification?.verified_at ?? verification?.verifiedAt ?? null,
      expiresIn: verification?.expires_in ?? verification?.expiresIn ?? null,
    },
    /* Server-side money is authoritative — never recompute locally. */
    subtotal: Number(totals?.subtotal ?? o.subtotal ?? 0),
    discountTotal: Number(totals?.discount_total ?? totals?.discountTotal ?? o.discount_total ?? 0),
    deliveryFee: Number(totals?.delivery_fee ?? totals?.deliveryFee ?? o.delivery_fee ?? o.deliveryFee ?? 0),
    total: Number(totals?.total ?? o.total ?? o.total_price ?? 0),
    currency: totals?.currency ?? o.currency ?? null,
    isVerified: Boolean(o.is_verified ?? o.verified ?? false),
    paymentMethod: payment?.method ?? o.payment_method ?? null,
    paymentMethodLabel: payment?.method_label ?? payment?.methodLabel ?? null,
    paymentStatus: payment?.status ?? o.payment_status ?? null,
    paymentStatusLabel: payment?.status_label ?? payment?.statusLabel ?? null,
    paymentDescription: payment?.description ?? null,
    paymentPhone: payment?.notified_phone ?? payment?.notifiedPhone ?? null,
    paymentFailureReason: payment?.failure_reason ?? payment?.failureReason ?? null,
    paymentExpiresIn: payment?.expires_in ?? payment?.expiresIn ?? null,
    paymentAttemptsRemaining: payment?.attempts_remaining ?? payment?.attemptsRemaining ?? null,
    paymentShouldPoll: Boolean(payment?.should_poll ?? payment?.shouldPoll ?? false),
    paymentIsRetryable: Boolean(payment?.is_retryable ?? payment?.isRetryable ?? false),
    paymentPaidAt: payment?.paid_at ?? payment?.paidAt ?? null,
    paymentUrl: payment?.url ?? o.payment_url ?? null,
    paymentReceivingInfo: receivingInfo,
    paymentProofTransactionReference:
      proof?.transaction_reference
      ?? proof?.transactionReference
      ?? payment?.transaction_reference
      ?? payment?.transactionReference
      ?? null,
    paymentReceiptUrl:
      proof?.receipt_url
      ?? proof?.receiptUrl
      ?? proof?.screenshot_url
      ?? proof?.screenshotUrl
      ?? null,
    phoneNumber: o.phone_number ?? o.phoneNumber ?? null,
    deliveryPhone: o.delivery_phone ?? o.deliveryPhone ?? null,
    hasThirdPartyDelivery: Boolean(o.has_third_party_delivery ?? o.hasThirdPartyDelivery ?? false),
    address: o.address ?? null,
    note: o.note ?? null,
    deliveryCode: o.delivery_code ?? o.deliveryCode ?? null,
    placedAt: o.placed_at ?? o.placedAt ?? null,
    createdAt: o.created_at ?? o.createdAt ?? null,
    items,
    raw: o,
  };
}

/**
 * Price the current cart without modifying it.
 *
 * @returns {Promise<{ok: boolean, data: any, message: string|null,
 *   status: number|null, code?: string|null}>}
 */
export const previewCheckout = () => orderRequest('/checkout');

/**
 * Convert the cart into an unverified order; the API dispatches the OTP.
 *
 * @param {{name: string, address: string, phone: string,
 *          delivery_phone?: string, note?: string}} details
 * @returns {Promise<{ok: boolean, data: any, message: string|null,
 *   status: number|null, code?: string|null}>}
 */
export const placeOrder = (details) =>
  orderRequest('/checkout', { method: 'POST', body: details });

export const confirmJawwalPayCheckout = (confirmationUrl, payload) =>
  orderRequest(apiPathFromConfirmationUrl(confirmationUrl, API_PREFIX), {
    method: 'POST',
    body: payload,
    timeoutMs: 15000,
  });

/**
 * @returns {Promise<{ok: boolean, data: any, message: string|null,
 *   status: number|null, code?: string|null}>}
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
 * Submit manual payment proof after the customer completes a transfer.
 *
 * @param {string} orderNumber
 * @param {{transactionReference: string, receiptFile: File}} proof
 */
export const submitOrderPaymentProof = (orderNumber, proof) => {
  const body = new FormData();
  body.append('transaction_reference', String(proof.transactionReference ?? '').trim());
  body.append('receipt', proof.receiptFile);

  return orderFormRequest(`/orders/${encodeURIComponent(orderNumber)}/payment/proof`, {
    method: 'POST',
    body,
    timeoutMs: 20000,
  });
};

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

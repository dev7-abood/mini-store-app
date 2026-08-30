/*
|--------------------------------------------------------------------------
| Order Flow Context
|--------------------------------------------------------------------------
| Owns the SERVER side of an order's life:
|
|   preview()  GET  /checkout                  price the basket
|   place()    POST /checkout                  cart => order + OTP sent
|   verify()   POST /orders/{n}/verify         confirm the phone
|   resend()   POST /orders/{n}/resend         re-send the OTP
|   refresh()  GET  /orders/{n}                latest status
|   cancel()   POST /orders/{n}/cancel
|   retryPay() POST /orders/{n}/payment/retry
|              GET  /orders/{n}/payment        smart payments only
|
| The customer/payment FORM (name / address / phones) stays in OrderContext —
| this context deals only with what the server owns.
|
| Money note: EVERY currency figure comes from the server response,
| already rounded to 2 decimals — the client never computes, sums or
| rounds an amount. A field the API didn't send stays null so the screen
| can omit it instead of showing a fabricated 0.
*/
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  previewCheckout,
  placeOrder,
  verifyOrder,
  resendOrderOtp,
  fetchOrder,
  cancelOrder,
  fetchOrderPayment,
  retryOrderPayment,
  confirmJawwalPayCheckout,
  normalizeOrder,
  hasBackend,
} from '../api/client';
import {
  buildJawwalPayConfirmationRequest,
  normalizeJawwalPayOtpSession,
  resolveJawwalPayConfirmationOutcome,
} from '../lib/jawwalPayCheckout';
import { normalizePayment, pollDelayMs } from '../lib/payment';
import { pickMoney } from '../lib/money';
import { useStoreStatus } from './StoreStatusContext';

const OrderFlowContext = createContext(null);

/** Give up polling after this long so we never loop forever. */
const PAYMENT_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export function OrderFlowProvider({ children }) {
  const { markClosed } = useStoreStatus();
  const [order, setOrder] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(null);
  const [payment, setPayment] = useState(null);
  const [jawwalPayOtpSession, setJawwalPayOtpSession] = useState(null);

  const pollTimer = useRef(null);
  const pollStartedAt = useRef(0);
  const jawwalPayConfirming = useRef(false);

  /** Stop any running payment poll. */
  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  /*
  |--------------------------------------------------------------------------
  | Checkout
  |--------------------------------------------------------------------------
  */

  /**
   * Price the basket server-side (does not mutate the cart).
   *
   * @returns {Promise<object|null>}
   */
  const preview = useCallback(async () => {
    if (!hasBackend()) return null;

    setIsBusy(true);
    const result = await previewCheckout();
    setIsBusy(false);

    if (!result.ok) {
      setError(result.message);
      return null;
    }

    /* Straight from the server's own pricing block — `summary` when it
       sends one, `totals` for the delivery fee, and the bare payload as
       the last fallback. Pre-rounded to 2 decimals; nothing is summed
       or multiplied here. null = the API didn't price that field. */
    const data = result.data ?? {};
    const summary = data.summary ?? null;
    const totals = data.totals ?? null;
    const priced = {
      subtotal: pickMoney(summary?.subtotal, totals?.subtotal, data.subtotal),
      discountTotal: pickMoney(
        summary?.discount_total, summary?.discountTotal,
        totals?.discount_total, totals?.discountTotal, data.discount_total,
      ),
      deliveryFee: pickMoney(
        totals?.delivery_fee, totals?.deliveryFee,
        summary?.delivery_fee, summary?.deliveryFee,
        data.delivery_fee, data.deliveryFee,
      ),
      total: pickMoney(summary?.total, totals?.total, data.total),
      items: Array.isArray(data.items) ? data.items : [],
    };
    setPricing(priced);
    return priced;
  }, []);

  /**
   * Turn the cart into an order. The API sends the OTP; the caller then
   * navigates to the OTP screen.
   *
   * @param {{name: string, address: string, phone: string,
   *          delivery_phone?: string, note?: string, payment_method?: string}} details
   * @returns {Promise<{ok: boolean, order: object|null,
   *   message: string|null, code?: string|null}>}
   */
  const place = useCallback(async (details) => {
    setError(null);
    setIsBusy(true);
    const result = await placeOrder(details);
    setIsBusy(false);

    if (!result.ok) {
      if (result.code === 'STORE_CLOSED') {
        markClosed({ message: result.message, data: result.data, code: result.code });
      }
      setError(result.message);
      return { ok: false, order: null, message: result.message, code: result.code };
    }

    const session = normalizeJawwalPayOtpSession(result.data, details);
    if (session) {
      stopPolling();
      setJawwalPayOtpSession(session);
      setPayment(normalizePayment(result.data?.payment));
      setOrder(null);
      return {
        ok: true,
        order: null,
        message: result.message,
        jawwalPayOtpRequired: true,
        jawwalPayOtpSession: session,
        shouldPoll: false,
      };
    }

    setJawwalPayOtpSession(null);
    const placed = normalizeOrder(result.data);
    setOrder(placed);
    /* The payment request has NOT been pushed yet — the phone is still
       unverified, so even a manual order is not on the store's board and
       `awaiting_confirmation` is false. The OTP screen comes next. */
    setPayment(placed?.payment ?? null);
    return { ok: true, order: placed, message: null };
  }, [markClosed, stopPolling]);

  const clearJawwalPayOtpSession = useCallback(() => {
    setJawwalPayOtpSession(null);
  }, []);

  const confirmJawwalPayOtp = useCallback(async (code) => {
    if (!jawwalPayOtpSession) {
      return { ok: false, message: null, missingSession: true };
    }

    if (jawwalPayConfirming.current) {
      return { ok: false, duplicate: true };
    }

    let requestDetails;
    try {
      requestDetails = buildJawwalPayConfirmationRequest(jawwalPayOtpSession, code);
    } catch (errorDetails) {
      return { ok: false, message: errorDetails.message, invalidLength: true };
    }

    jawwalPayConfirming.current = true;
    setError(null);
    setIsBusy(true);
    let result;
    try {
      result = await confirmJawwalPayCheckout(requestDetails.url, requestDetails.payload);
    } finally {
      setIsBusy(false);
      jawwalPayConfirming.current = false;
    }

    const outcome = resolveJawwalPayConfirmationOutcome(result);
    if (!result.ok || outcome.action !== 'redirect') {
      if (!outcome.keepSession) setJawwalPayOtpSession(null);
      setError(outcome.message);
      return {
        ...result,
        ok: false,
        message: outcome.message ?? result.message,
        outcome,
      };
    }

    setJawwalPayOtpSession(null);
    const confirmed = normalizeOrder(outcome.order ?? result.data?.order ?? result.data);
    setPayment(
      normalizePayment(outcome.payment ?? result.data?.payment) ?? confirmed?.payment ?? null,
    );

    if (confirmed) setOrder(confirmed);

    return {
      ok: true,
      order: confirmed,
      payment: outcome.payment,
      redirectUrl: outcome.redirectUrl,
      checkoutCompleted: true,
      message: result.message,
      outcome,
    };
  }, [jawwalPayOtpSession]);

  const resendJawwalPayOtp = useCallback(async () => {
    if (!jawwalPayOtpSession?.checkoutPayload) {
      return { ok: false, message: null, missingSession: true };
    }

    const remainingSeconds = Math.max(
      0,
      Math.ceil((jawwalPayOtpSession.expiresAt - Date.now()) / 1000),
    );

    if (remainingSeconds > 0) {
      return { ok: false, message: null, notExpired: true, remainingSeconds };
    }

    return place(jawwalPayOtpSession.checkoutPayload);
  }, [jawwalPayOtpSession, place]);

  /*
  |--------------------------------------------------------------------------
  | Phone verification
  |--------------------------------------------------------------------------
  */

  /**
   * Verify the OTP. A wrong code is a normal outcome, not an exception —
   * the screen shakes the input and lets the customer retry.
   *
   * @param {string} code
   * @returns {Promise<{ok: boolean, message: string|null, throttled: boolean}>}
   */
  const verify = useCallback(
    async (code) => {
      if (!order?.orderNumber) {
        return { ok: false, message: null, throttled: false };
      }

      setError(null);
      setIsBusy(true);
      const result = await verifyOrder(order.orderNumber, code);
      setIsBusy(false);

      if (!result.ok) {
        setError(result.message);
        return {
          ok: false,
          message: result.message,
          throttled: result.status === 429,
        };
      }

      const verified = normalizeOrder(result.data) ?? { ...order, isVerified: true };
      setOrder(verified);

      /* Verifying releases the order AND pushes the payment request —
         the moment the store is notified. The response's own `payment`
         block is the freshest state there is: for a manual method it
         carries the transfer instructions, so the caller can go straight
         to the instructions screen without a second round trip. */
      const pushed = normalizePayment(result.data?.payment) ?? verified?.payment ?? null;
      setPayment(pushed);

      return { ok: true, message: null, throttled: false, payment: pushed };
    },
    [order],
  );

  /**
   * Ask for a fresh OTP (server allows 5/min).
   *
   * @returns {Promise<{ok: boolean, message: string|null, throttled: boolean}>}
   */
  const resend = useCallback(async () => {
    if (!order?.orderNumber) return { ok: false, message: null, throttled: false };

    setIsBusy(true);
    const result = await resendOrderOtp(order.orderNumber);
    setIsBusy(false);

    return {
      ok: result.ok,
      message: result.message,
      throttled: result.status === 429,
    };
  }, [order]);

  /*
  |--------------------------------------------------------------------------
  | Order status
  |--------------------------------------------------------------------------
  */

  /**
   * Load one order by number.
   *
   * @param {string} orderNumber
   * @param {{silent?: boolean}} [options]
   * @returns {Promise<{ok: boolean, order: object|null, message: string|null,
   *   status: number|null, empty?: boolean}>}
   */
  const loadOrder = useCallback(async (orderNumber, { silent = false } = {}) => {
    if (!orderNumber || !hasBackend()) {
      return { ok: false, order: null, message: null, status: null };
    }

    setError(null);
    if (!silent) setIsBusy(true);
    const result = await fetchOrder(orderNumber);
    if (!silent) setIsBusy(false);

    if (!result.ok) {
      setError(result.message);
      return {
        ok: false,
        order: null,
        message: result.message,
        status: result.status,
      };
    }

    const loaded = normalizeOrder(result.data);
    if (!loaded) {
      return { ok: false, order: null, message: null, status: result.status, empty: true };
    }

    setOrder(loaded);
    return { ok: true, order: loaded, message: null, status: result.status };
  }, []);

  /**
   * Re-read the order from the server.
   *
   * @param {string} [orderNumber] Defaults to the active order.
   * @returns {Promise<object|null>}
   */
  const refresh = useCallback(
    async (orderNumber) => {
      const number = orderNumber ?? order?.orderNumber;
      if (!number) return null;

      const result = await loadOrder(number, { silent: true });
      return result.order;
    },
    [order, loadOrder],
  );

  /**
   * Cancel the active order.
   *
   * @returns {Promise<boolean>}
   */
  const cancel = useCallback(async () => {
    if (!order?.orderNumber) return false;

    setIsBusy(true);
    const result = await cancelOrder(order.orderNumber);
    setIsBusy(false);

    if (!result.ok) {
      setError(result.message);
      return false;
    }

    stopPolling();
    setOrder(normalizeOrder(result.data) ?? { ...order, status: 'cancelled' });
    return true;
  }, [order, stopPolling]);

  /*
  |--------------------------------------------------------------------------
  | Payment
  |--------------------------------------------------------------------------
  */

  /**
   * Read the payment once. The light endpoint — it carries exactly the
   * same confirmation fields as the order, so a screen refreshing only
   * the payment can never drift from one refreshing the whole order.
   *
   * @param {string} [orderNumber]
   * @returns {Promise<object|null>}
   */
  const refreshPayment = useCallback(
    async (orderNumber) => {
      const number = orderNumber ?? order?.orderNumber;
      if (!number || !hasBackend()) return null;

      const result = await fetchOrderPayment(number);
      if (!result.ok) return null;

      const next = normalizePayment(result.data);
      if (next) setPayment(next);
      return next;
    },
    [order],
  );

  /**
   * Poll the payment endpoint while the gateway is still deciding.
   *
   * ONLY for payments whose `should_poll` is true. A manual payment is
   * resolved by a cashier — sometimes hours later — and its `should_poll`
   * is false forever: a timer there would spin all day, burn the
   * customer's battery and data, never see a change, and walk straight
   * into the 120/min throttle this endpoint sizes for smart polling.
   * Manual payments refresh on app resume, on pull-to-refresh, and on a
   * single slow foreground interval instead (see the order screen).
   *
   * The cadence comes from the payment's own `poll_after`, which is only
   * meaningful while `should_poll` is true.
   *
   * @param {string} [orderNumber]
   * @returns {void}
   */
  const startPaymentPolling = useCallback(
    (orderNumber) => {
      const number = orderNumber ?? order?.orderNumber;
      if (!number || !hasBackend()) return;

      stopPolling();
      pollStartedAt.current = Date.now();

      const tick = async () => {
        const result = await fetchOrderPayment(number);
        const next = result.ok ? normalizePayment(result.data) : null;

        if (next) {
          setPayment(next);

          /* The server decides when watching stops — not a status list
             of ours that a new state could fall outside of. */
          if (!next.shouldPoll) {
            stopPolling();
            /* Pull the order once more so status/total reflect payment. */
            refresh(number);
            return;
          }
        }

        if (Date.now() - pollStartedAt.current > PAYMENT_POLL_TIMEOUT_MS) {
          stopPolling();
          refresh(number);
          return;
        }

        pollTimer.current = setTimeout(tick, pollDelayMs(next));
      };

      tick();
    },
    [order, refresh, stopPolling],
  );

  /**
   * Watch the payment only if the server says to. Called wherever a
   * payment has just been pushed: smart payments start polling, manual
   * ones deliberately do nothing.
   *
   * @param {object|null} paymentState
   * @param {string} [orderNumber]
   */
  const watchPayment = useCallback(
    (paymentState, orderNumber) => {
      if (paymentState?.shouldPoll) startPaymentPolling(orderNumber);
    },
    [startPaymentPolling],
  );

  /**
   * Start a new payment attempt after a decline or an expiry. The order
   * itself is not cancelled — only the previous attempt failed — so a
   * manual method returns to `awaiting_transfer` with fresh instructions.
   *
   * @returns {Promise<{ok: boolean, payment: object|null, message: string|null}>}
   */
  const retryPayment = useCallback(async () => {
    if (!order?.orderNumber) return { ok: false, payment: null, message: null };

    setIsBusy(true);
    const result = await retryOrderPayment(order.orderNumber);
    setIsBusy(false);

    if (!result.ok) {
      setError(result.message);
      return { ok: false, payment: null, message: result.message };
    }

    const next = normalizePayment(result.data);
    if (next) setPayment(next);
    watchPayment(next, order.orderNumber);
    refresh(order.orderNumber);
    return { ok: true, payment: next, message: result.message };
  }, [order, watchPayment, refresh]);

  /** Clear everything (after a completed or abandoned order). */
  const reset = useCallback(() => {
    stopPolling();
    setOrder(null);
    setPricing(null);
    setPayment(null);
    setJawwalPayOtpSession(null);
    setError(null);
  }, [stopPolling]);

  const value = useMemo(
    () => ({
      order,
      orderNumber: order?.orderNumber ?? null,
      pricing,
      payment,
      jawwalPayOtpSession,
      isBusy,
      error,
      preview,
      place,
      verify,
      resend,
      confirmJawwalPayOtp,
      resendJawwalPayOtp,
      clearJawwalPayOtpSession,
      loadOrder,
      refresh,
      cancel,
      startPaymentPolling,
      watchPayment,
      refreshPayment,
      stopPolling,
      retryPayment,
      reset,
    }),
    [
      order, pricing, payment, jawwalPayOtpSession, isBusy, error,
      preview, place, verify, resend, loadOrder, refresh, cancel,
      confirmJawwalPayOtp, resendJawwalPayOtp, clearJawwalPayOtpSession,
      startPaymentPolling, watchPayment, refreshPayment, stopPolling,
      retryPayment, reset,
    ],
  );

  return <OrderFlowContext.Provider value={value}>{children}</OrderFlowContext.Provider>;
}

export function useOrderFlow() {
  const ctx = useContext(OrderFlowContext);
  if (!ctx) throw new Error('useOrderFlow must be used inside <OrderFlowProvider>');
  return ctx;
}

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
|   remind()   POST /orders/{n}/payment/remind
|              GET  /manual-payment/{method}   pay-from details, no order
|              GET  /orders/{n}/payment        smart payments only
|
| On a manual method `place()` is the customer's "I have paid" CLAIM: it
| creates the order, sends no OTP, and leaves the payment unpaid until a
| cashier verifies it.
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
  fetchManualPaymentDetails,
  remindOrderPayment,
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
import {
  normalizeManualPaymentPreview,
  normalizePayment,
  pollDelayMs,
} from '../lib/payment';
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

  /* The active order number, held in a ref so the callbacks below keep a
     STABLE identity across refreshes.
     Depending on the order object instead would rebuild every callback
     each time the order is re-read — and any screen whose effect calls
     one of them would then re-run, re-fetch, and loop forever. */
  const activeOrderNumber = useRef(null);
  activeOrderNumber.current = order?.orderNumber ?? null;

  /** The order number a call should act on: the argument, else the active one. */
  const targetOrderNumber = useCallback(
    (orderNumber) => orderNumber ?? activeOrderNumber.current,
    [],
  );

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
    /*
     | Smart: the order exists unverified and the API has sent an OTP.
     |
     | Manual: this call WAS the customer's "I have paid" claim. The
     | order is placed and the store notified, but the payment is only a
     | claim — `is_paid` is false and `awaiting_confirmation` is true
     | until a cashier decides. A 201 here is never a success screen.
     */
    setPayment(placed?.payment ?? null);
    return { ok: true, order: placed, message: result.message };
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
      const number = activeOrderNumber.current;
      if (!number) {
        return { ok: false, message: null, throttled: false };
      }

      setError(null);
      setIsBusy(true);
      const result = await verifyOrder(number, code);
      setIsBusy(false);

      if (!result.ok) {
        setError(result.message);
        return {
          ok: false,
          message: result.message,
          throttled: result.status === 429,
        };
      }

      const verified = normalizeOrder(result.data);
      setOrder((current) => verified ?? (current ? { ...current, isVerified: true } : current));

      /* Verifying releases the order AND pushes the payment request —
         the moment the store is notified. The response's own `payment`
         block is the freshest state there is: for a manual method it
         carries the transfer instructions, so the caller can go straight
         to the instructions screen without a second round trip. */
      const pushed = normalizePayment(result.data?.payment) ?? verified?.payment ?? null;
      setPayment(pushed);

      return { ok: true, message: null, throttled: false, payment: pushed };
    },
    [],
  );

  /**
   * Ask for a fresh OTP (server allows 5/min).
   *
   * @returns {Promise<{ok: boolean, message: string|null, throttled: boolean}>}
   */
  const resend = useCallback(async () => {
    const number = activeOrderNumber.current;
    if (!number) return { ok: false, message: null, throttled: false };

    setIsBusy(true);
    const result = await resendOrderOtp(number);
    setIsBusy(false);

    return {
      ok: result.ok,
      message: result.message,
      throttled: result.status === 429,
    };
  }, []);

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
      const number = targetOrderNumber(orderNumber);
      if (!number) return null;

      const result = await loadOrder(number, { silent: true });
      return result.order;
    },
    [targetOrderNumber, loadOrder],
  );

  /**
   * Cancel the active order.
   *
   * @returns {Promise<boolean>}
   */
  const cancel = useCallback(async () => {
    const number = activeOrderNumber.current;
    if (!number) return false;

    setIsBusy(true);
    const result = await cancelOrder(number);
    setIsBusy(false);

    if (!result.ok) {
      setError(result.message);
      return false;
    }

    stopPolling();
    const cancelled = normalizeOrder(result.data);
    setOrder((current) => cancelled ?? (current ? { ...current, status: 'cancelled' } : current));
    return true;
  }, [stopPolling]);

  /*
  |--------------------------------------------------------------------------
  | Payment
  |--------------------------------------------------------------------------
  */

  /**
   * Payment details for the current cart on a manual method — the screen
   * the customer pays from, before any order exists.
   *
   * @param {string} method
   * @returns {Promise<{ok: boolean, details: object|null, message: string|null}>}
   */
  const loadManualPaymentDetails = useCallback(async (method) => {
    if (!method || !hasBackend()) {
      return { ok: false, details: null, message: null };
    }

    setError(null);
    setIsBusy(true);
    const result = await fetchManualPaymentDetails(method);
    setIsBusy(false);

    if (!result.ok) {
      setError(result.message);
      return { ok: false, details: null, message: result.message };
    }

    const details = normalizeManualPaymentPreview(result.data);
    if (!details) {
      return { ok: false, details: null, message: result.message };
    }

    return { ok: true, details, message: null };
  }, []);

  /**
   * Nudge the store to check a payment it has not verified yet. Notifies
   * and nothing else — it can never move the payment, so the caller must
   * stay where it is and only refresh the reminder cooldown.
   *
   * @param {string} [orderNumber]
   * @returns {Promise<{ok: boolean, reminder: object|null, message: string|null}>}
   */
  const remindStore = useCallback(
    async (orderNumber) => {
      const number = targetOrderNumber(orderNumber);
      if (!number || !hasBackend()) {
        return { ok: false, reminder: null, message: null };
      }

      const result = await remindOrderPayment(number);

      if (!result.ok) {
        /* A refusal (too soon, or nothing awaiting) is an expected
           outcome the disabled button should have prevented — surfaced
           as a message, never as a failed screen. */
        return { ok: false, reminder: null, message: result.message };
      }

      const reminder = normalizePayment({ reminder: result.data?.reminder })?.reminder ?? null;

      /* Only the cooldown changed — the payment itself is untouched, and
         a reminder can never move it. Both copies of the block are
         updated so a screen reading the order's copy and one reading the
         payment endpoint's copy show the same cooldown. */
      if (reminder) {
        setPayment((current) => (current ? { ...current, reminder } : current));
        setOrder((current) => (
          current?.payment
            ? { ...current, payment: { ...current.payment, reminder } }
            : current
        ));
      }

      return { ok: true, reminder, message: result.message };
    },
    [targetOrderNumber],
  );

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
      const number = targetOrderNumber(orderNumber);
      if (!number || !hasBackend()) return null;

      const result = await fetchOrderPayment(number);
      if (!result.ok) return null;

      const next = normalizePayment(result.data);
      if (next) setPayment(next);
      return next;
    },
    [targetOrderNumber],
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
      const number = targetOrderNumber(orderNumber);
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
    [targetOrderNumber, refresh, stopPolling],
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
   * Start a new payment attempt after a smart decline or expiry.
   *
   * Never reachable for a rejected claim: `is_retryable` is false there
   * by design. A mistaken rejection is fixed by the cashier approving,
   * never by the customer claiming again.
   *
   * @returns {Promise<{ok: boolean, payment: object|null, message: string|null}>}
   */
  const retryPayment = useCallback(async () => {
    const number = activeOrderNumber.current;
    if (!number) return { ok: false, payment: null, message: null };

    setIsBusy(true);
    const result = await retryOrderPayment(number);
    setIsBusy(false);

    if (!result.ok) {
      setError(result.message);
      return { ok: false, payment: null, message: result.message };
    }

    const next = normalizePayment(result.data);
    if (next) setPayment(next);
    watchPayment(next, number);
    refresh(number);
    return { ok: true, payment: next, message: result.message };
  }, [watchPayment, refresh]);

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
      loadManualPaymentDetails,
      remindStore,
      stopPolling,
      retryPayment,
      reset,
    }),
    [
      order, pricing, payment, jawwalPayOtpSession, isBusy, error,
      preview, place, verify, resend, loadOrder, refresh, cancel,
      confirmJawwalPayOtp, resendJawwalPayOtp, clearJawwalPayOtpSession,
      startPaymentPolling, watchPayment, refreshPayment,
      loadManualPaymentDetails, remindStore, stopPolling, retryPayment, reset,
    ],
  );

  return <OrderFlowContext.Provider value={value}>{children}</OrderFlowContext.Provider>;
}

export function useOrderFlow() {
  const ctx = useContext(OrderFlowContext);
  if (!ctx) throw new Error('useOrderFlow must be used inside <OrderFlowProvider>');
  return ctx;
}

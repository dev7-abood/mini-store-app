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
|              GET  /orders/{n}/payment        polled automatically
|
| The checkout FORM (name / address / phones) stays in OrderContext —
| this context deals only with what the server owns.
|
| Money note: totals always come from the server response. The local cart
| total is a preview only; the API is authoritative once an order exists.
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
  submitOrderPaymentProof,
  normalizeOrder,
  hasBackend,
} from '../api/client';
import { isManualPaymentMethod } from '../lib/paymentMethods';
import { useStoreStatus } from './StoreStatusContext';

const OrderFlowContext = createContext(null);

/** Payment states that mean "stop polling". */
const PAYMENT_SETTLED = new Set(['approved', 'paid', 'completed', 'declined', 'failed', 'cancelled']);

/** How often to poll payment while the customer is in their wallet app. */
const PAYMENT_POLL_MS = 3000;
/** Give up polling after this long so we never loop forever. */
const PAYMENT_POLL_TIMEOUT_MS = 5 * 60 * 1000;
const MANUAL_AWAITING_PAYMENT = 'awaiting_payment';
const MANUAL_AWAITING_VERIFICATION = 'awaiting_verification';

function withManualPaymentStatus(order, methodId, status) {
  if (!order || !isManualPaymentMethod(methodId ?? order.paymentMethod)) return order;

  return {
    ...order,
    status,
    paymentMethod: order.paymentMethod ?? methodId,
    paymentStatus: status,
  };
}

export function OrderFlowProvider({ children }) {
  const { markClosed } = useStoreStatus();
  const [order, setOrder] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(null);
  const [payment, setPayment] = useState(null);

  const pollTimer = useRef(null);
  const pollStartedAt = useRef(0);

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

    const priced = {
      subtotal: Number(result.data?.subtotal ?? 0),
      deliveryFee: Number(result.data?.delivery_fee ?? result.data?.deliveryFee ?? 0),
      total: Number(result.data?.total ?? 0),
      items: Array.isArray(result.data?.items) ? result.data.items : [],
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

    const placed = withManualPaymentStatus(
      normalizeOrder(result.data),
      details.payment_method,
      MANUAL_AWAITING_PAYMENT,
    );
    setOrder(placed);
    return { ok: true, order: placed, message: null };
  }, [markClosed]);

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
      return { ok: true, message: null, throttled: false };
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
   * Poll the payment endpoint until it settles (or times out). The
   * server allows 120 req/min here precisely because it is polled.
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

        if (result.ok) {
          const state = result.data?.status ?? result.data?.payment?.status ?? null;
          setPayment({ status: state, data: result.data });

          if (state && PAYMENT_SETTLED.has(String(state).toLowerCase())) {
            stopPolling();
            /* Pull the order once more so status/total reflect payment. */
            refresh(number);
            return;
          }
        }

        if (Date.now() - pollStartedAt.current > PAYMENT_POLL_TIMEOUT_MS) {
          stopPolling();
          setPayment((p) => ({ ...(p ?? {}), status: 'timeout' }));
          return;
        }

        pollTimer.current = setTimeout(tick, PAYMENT_POLL_MS);
      };

      tick();
    },
    [order, refresh, stopPolling],
  );

  /**
   * Start a new payment attempt after a decline.
   *
   * @returns {Promise<boolean>}
   */
  const retryPayment = useCallback(async () => {
    if (!order?.orderNumber) return false;

    setIsBusy(true);
    const result = await retryOrderPayment(order.orderNumber);
    setIsBusy(false);

    if (!result.ok) {
      setError(result.message);
      return false;
    }

    setPayment({ status: 'pending', data: result.data });
    startPaymentPolling(order.orderNumber);
    return true;
  }, [order, startPaymentPolling]);

  /**
   * Submit the transaction number and receipt for a manual transfer.
   *
   * @param {{transactionReference: string, receiptFile: File}} proof
   * @returns {Promise<{ok: boolean, order: object|null, message: string|null}>}
   */
  const submitManualProof = useCallback(async (proof) => {
    if (!order?.orderNumber) {
      return { ok: false, order: null, message: null };
    }

    if (!hasBackend()) {
      const next = withManualPaymentStatus(
        {
          ...order,
          paymentProofTransactionReference: proof.transactionReference,
        },
        order.paymentMethod,
        MANUAL_AWAITING_VERIFICATION,
      );
      setOrder(next);
      setPayment({ status: MANUAL_AWAITING_VERIFICATION, data: next });
      return { ok: true, order: next, message: null };
    }

    setError(null);
    setIsBusy(true);
    const result = await submitOrderPaymentProof(order.orderNumber, proof);
    setIsBusy(false);

    if (!result.ok) {
      setError(result.message);
      return { ok: false, order: null, message: result.message };
    }

    const submitted = normalizeOrder(result.data) ?? {
      ...order,
      paymentProofTransactionReference: proof.transactionReference,
    };
    const next = withManualPaymentStatus(
      submitted,
      submitted.paymentMethod ?? order.paymentMethod,
      MANUAL_AWAITING_VERIFICATION,
    );
    setOrder(next);
    setPayment({ status: MANUAL_AWAITING_VERIFICATION, data: result.data });
    return { ok: true, order: next, message: result.message };
  }, [order]);

  /** Clear everything (after a completed or abandoned order). */
  const reset = useCallback(() => {
    stopPolling();
    setOrder(null);
    setPricing(null);
    setPayment(null);
    setError(null);
  }, [stopPolling]);

  const value = useMemo(
    () => ({
      order,
      orderNumber: order?.orderNumber ?? null,
      pricing,
      payment,
      isBusy,
      error,
      preview,
      place,
      verify,
      resend,
      loadOrder,
      refresh,
      cancel,
      startPaymentPolling,
      stopPolling,
      retryPayment,
      submitManualProof,
      reset,
    }),
    [
      order, pricing, payment, isBusy, error,
      preview, place, verify, resend, loadOrder, refresh, cancel,
      startPaymentPolling, stopPolling, retryPayment, submitManualProof, reset,
    ],
  );

  return <OrderFlowContext.Provider value={value}>{children}</OrderFlowContext.Provider>;
}

export function useOrderFlow() {
  const ctx = useContext(OrderFlowContext);
  if (!ctx) throw new Error('useOrderFlow must be used inside <OrderFlowProvider>');
  return ctx;
}

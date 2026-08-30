/*
|--------------------------------------------------------------------------
| Payment Methods Context
|--------------------------------------------------------------------------
| GET /payment-methods, cached for the session.
|
| The API returns only methods that are both enabled and fully
| configured, so there is no local fallback list and nothing to validate:
| what comes back is what the store can take. An empty list is a real
| answer — the store cannot take payment at all — and the chooser says so
| instead of rendering an empty group.
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchPaymentMethods, hasBackend } from '../api/client';
import { findPaymentMethodIn, normalizePaymentMethods } from '../lib/paymentMethods';
import { useTenant } from './TenantContext';

const PaymentMethodsContext = createContext(null);

export function PaymentMethodsProvider({ children }) {
  const tenant = useTenant();
  const [state, setState] = useState(() => ({
    status: hasBackend() ? 'loading' : 'ready',
    methods: [],
    error: null,
  }));

  const load = useCallback(async () => {
    if (!hasBackend()) {
      setState({ status: 'ready', methods: [], error: null });
      return;
    }

    setState((current) => ({ ...current, status: 'loading', error: null }));

    try {
      const payload = await fetchPaymentMethods();
      setState({ status: 'ready', methods: normalizePaymentMethods(payload), error: null });
    } catch (error) {
      console.warn('payment-methods fetch failed:', error);
      setState({ status: 'error', methods: [], error });
    }
  }, []);

  useEffect(() => {
    if (tenant.status === 'ready') load();
  }, [tenant.status, load]);

  const findAvailablePaymentMethod = useCallback(
    (id) => findPaymentMethodIn(state.methods, id),
    [state.methods],
  );

  const value = useMemo(
    () => ({
      ...state,
      isLoading: state.status === 'loading',
      isReady: state.status === 'ready',
      isError: state.status === 'error',
      /* The store takes no payment at all — distinct from "still loading". */
      hasMethods: state.methods.length > 0,
      defaultPaymentMethod: state.methods[0]?.id ?? '',
      findPaymentMethod: findAvailablePaymentMethod,
      reload: load,
    }),
    [state, findAvailablePaymentMethod, load],
  );

  return (
    <PaymentMethodsContext.Provider value={value}>
      {children}
    </PaymentMethodsContext.Provider>
  );
}

export function usePaymentMethods() {
  const ctx = useContext(PaymentMethodsContext);
  if (!ctx) throw new Error('usePaymentMethods must be used inside <PaymentMethodsProvider>');
  return ctx;
}

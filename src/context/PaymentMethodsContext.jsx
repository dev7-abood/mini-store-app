import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchPaymentMethods, hasBackend } from '../api/client';
import {
  DEFAULT_PAYMENT_METHOD,
  availablePaymentMethodsFromSettings,
  findPaymentMethodIn,
} from '../lib/paymentMethods';
import { useTenant } from './TenantContext';

const PaymentMethodsContext = createContext(null);

function fallbackMethods() {
  return availablePaymentMethodsFromSettings(null, {
    useStaticManualFallback: !hasBackend(),
  });
}

export function PaymentMethodsProvider({ children }) {
  const tenant = useTenant();
  const [state, setState] = useState(() => ({
    status: hasBackend() ? 'loading' : 'ready',
    methods: fallbackMethods(),
    error: null,
  }));

  const load = useCallback(async () => {
    if (!hasBackend()) {
      setState({ status: 'ready', methods: fallbackMethods(), error: null });
      return;
    }

    setState((current) => ({
      ...current,
      status: 'loading',
      methods: availablePaymentMethodsFromSettings(null),
      error: null,
    }));

    try {
      const payload = await fetchPaymentMethods();
      setState({
        status: 'ready',
        methods: availablePaymentMethodsFromSettings(payload),
        error: null,
      });
    } catch (error) {
      console.warn('payment-methods fetch failed:', error);
      setState({
        status: 'error',
        methods: availablePaymentMethodsFromSettings(null),
        error,
      });
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
      defaultPaymentMethod: state.methods[0]?.id ?? DEFAULT_PAYMENT_METHOD,
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

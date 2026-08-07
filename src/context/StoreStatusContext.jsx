/*
|--------------------------------------------------------------------------
| Store Status Context
|--------------------------------------------------------------------------
| Reads the branch's live open/closed state from
| GET /telegram/store/status. The UI uses this to label the store and
| disable checkout when the API says orders cannot be accepted.
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchStoreStatus, hasBackend } from '../api/client';
import { useTenant } from './TenantContext';

const StoreStatusContext = createContext(null);

const INITIAL = {
  status: 'loading', // 'loading' | 'ready' | 'error'
  isOpen: null,
  canCheckout: true,
  acceptPreorders: false,
  message: null,
  code: null,
  raw: null,
};

function closedPatch({ message = null, data = null, code = 'STORE_CLOSED' } = {}) {
  return {
    status: 'ready',
    isOpen: false,
    canCheckout: false,
    acceptPreorders: Boolean(data?.accept_preorders ?? data?.acceptPreorders ?? false),
    message,
    code,
    raw: data,
  };
}

export function StoreStatusProvider({ children }) {
  const tenant = useTenant();
  const [state, setState] = useState(INITIAL);
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++generationRef.current;
    const isCurrent = () => generation === generationRef.current;

    setState((s) => ({ ...s, status: 'loading' }));

    if (!hasBackend()) {
      setState((s) => ({ ...s, status: 'error', canCheckout: true }));
      return null;
    }

    try {
      const next = await fetchStoreStatus();
      if (!isCurrent()) return next;

      setState({
        status: 'ready',
        isOpen: next.isOpen,
        canCheckout: next.canCheckout,
        acceptPreorders: next.acceptPreorders,
        message: next.message,
        code: next.code,
        raw: next.raw,
      });
      return next;
    } catch (error) {
      console.warn('Store status fetch failed:', error);
      if (isCurrent()) setState((s) => ({ ...s, status: 'error', canCheckout: true }));
      return null;
    }
  }, []);

  const markClosed = useCallback((details) => {
    setState((s) => ({
      ...s,
      ...closedPatch(details),
      message: details?.message ?? s.message,
    }));
  }, []);

  useEffect(() => {
    if (tenant.status === 'ready') refresh();
  }, [tenant.status, refresh]);

  const value = useMemo(
    () => ({
      ...state,
      isLoading: state.status === 'loading',
      isError: state.status === 'error',
      isReady: state.status === 'ready',
      isClosed: state.status === 'ready' && state.canCheckout === false,
      refresh,
      markClosed,
    }),
    [state, refresh, markClosed],
  );

  return <StoreStatusContext.Provider value={value}>{children}</StoreStatusContext.Provider>;
}

export function useStoreStatus() {
  const ctx = useContext(StoreStatusContext);
  if (!ctx) throw new Error('useStoreStatus must be used inside <StoreStatusProvider>');
  return ctx;
}

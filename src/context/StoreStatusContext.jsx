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
const OPEN_REFRESH_MS = 60000;
const CLOSED_REFRESH_MS = 10000;

const INITIAL = {
  status: 'loading', // 'loading' | 'ready' | 'error'
  isOpen: null,
  canCheckout: true,
  acceptPreorders: false,
  message: null,
  code: null,
  raw: null,
  lastCheckedAt: null,
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
    lastCheckedAt: Date.now(),
  };
}

export function StoreStatusProvider({ children }) {
  const tenant = useTenant();
  const [state, setState] = useState(INITIAL);
  const generationRef = useRef(0);
  const stateRef = useRef(INITIAL);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    const generation = ++generationRef.current;
    const isCurrent = () => generation === generationRef.current;

    if (!silent) setState((s) => ({ ...s, status: 'loading' }));

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
        lastCheckedAt: Date.now(),
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

  useEffect(() => {
    if (tenant.status !== 'ready' || !hasBackend()) return undefined;

    let stopped = false;
    let timer = null;

    const schedule = () => {
      if (stopped) return;
      const current = stateRef.current;
      const delay = current.canCheckout === false ? CLOSED_REFRESH_MS : OPEN_REFRESH_MS;
      timer = window.setTimeout(async () => {
        await refresh({ silent: true });
        schedule();
      }, delay);
    };

    schedule();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [tenant.status, refresh, state.canCheckout]);

  useEffect(() => {
    if (tenant.status !== 'ready' || !hasBackend()) return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refresh({ silent: true });
    };

    window.addEventListener('focus', refreshIfVisible);
    window.addEventListener('pageshow', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      window.removeEventListener('pageshow', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [tenant.status, refresh]);

  const value = useMemo(
    () => ({
      ...state,
      isLoading: state.status === 'loading',
      isError: state.status === 'error',
      isReady: state.status === 'ready',
      isClosed: state.status === 'ready' && state.canCheckout === false,
      isChecking: state.status === 'loading',
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

/*
|--------------------------------------------------------------------------
| Tenant Context
|--------------------------------------------------------------------------
| Resolves WHICH restaurant this launch belongs to, before any data
| loads. Resolution order:
|
|   deep link payload -> CloudStorage -> VITE_API_BASE_URL (dev/single
|   tenant) -> demo mode (browser) or "open from the bot" (in Telegram)
|
| statuses:
|   'resolving' — bootstrap in progress (splash keeps showing)
|   'ready'     — API configured; source tells where the ctx came from
|   'missing'   — inside Telegram but no tenant known: show the
|                 OpenFromBot screen, make no requests
*/
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolveTenantContext, isInsideTelegram } from '../lib/tenantContext';
import { configureApiClient, hasBackend } from '../api/client';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [state, setState] = useState({ status: 'resolving', source: null, ctx: null });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const resolved = await resolveTenantContext();
      if (cancelled) return;

      if (resolved) {
        configureApiClient(resolved.payload);
        setState({ status: 'ready', source: resolved.source, ctx: resolved.payload });
        return;
      }

      if (hasBackend()) {
        /* Single-tenant / dev: VITE_API_BASE_URL already configured. */
        setState({ status: 'ready', source: 'env', ctx: null });
        return;
      }

      if (isInsideTelegram()) {
        /* In Telegram with no tenant — user must start from the bot. */
        setState({ status: 'missing', source: null, ctx: null });
        return;
      }

      /* Plain browser with nothing configured: demo mode (seed catalog). */
      console.warn('No tenant context — running in demo mode with the seed catalog.');
      setState({ status: 'ready', source: 'demo', ctx: null });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      isResolving: state.status === 'resolving',
      isMissing: state.status === 'missing',
      branchId: state.ctx?.b ?? null,
    }),
    [state],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>');
  return ctx;
}

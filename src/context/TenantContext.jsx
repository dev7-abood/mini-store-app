/*
|--------------------------------------------------------------------------
| Tenant Context
|--------------------------------------------------------------------------
| Resolves WHICH restaurant this launch belongs to, before any data
| loads. Resolution order (first hit wins the base URL):
|
|   1. registry  — bot id identified via signed initData matched
|                  against /tenants.json -> tenant_base_url
|   2. deeplink  — decoded start_param payload (u)
|   3. cloud     — payload remembered in CloudStorage
|   4. env       — VITE_API_BASE_URL (single tenant / local dev)
|      missing   — nothing resolvable: OpenFromBot screen, no requests
|
| The deep-link payload's branch (b) applies even when the registry
| wins the URL. All routing only — the tenant middleware's initData
| HMAC check remains the authentication.
*/
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolveTenantContext } from '../lib/tenantContext';
import { loadTenantRegistry, detectBotId, findTenantByBotId } from '../lib/tenantRegistry';
import { configureApiClient, hasBackend } from '../api/client';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [state, setState] = useState({
    status: 'resolving',
    source: null,
    ctx: null,
    tenantName: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      /* Registry + deep link resolve in parallel; bot id detection
         needs the registry's candidate ids (signature identification),
         but it's purely local crypto — ~1ms per tenant. */
      const [tenants, resolved] = await Promise.all([
        loadTenantRegistry(),
        resolveTenantContext(),
      ]);
      if (cancelled) return;

      const botId = await detectBotId(tenants);
      if (cancelled) return;

      /* 1. Registry match on the launching bot. */
      const registryEntry = findTenantByBotId(tenants, botId);
      if (registryEntry) {
        configureApiClient({
          u: registryEntry.baseUrl,
          /* branch from the deep link still applies when present */
          b: resolved?.payload?.b,
        });
        setState({
          status: 'ready',
          source: 'registry',
          ctx: { u: registryEntry.baseUrl, b: resolved?.payload?.b ?? null },
          tenantName: registryEntry.name,
        });
        return;
      }

      /* 2–3. Deep-link payload (fresh or from CloudStorage). */
      if (resolved) {
        configureApiClient(resolved.payload);
        setState({
          status: 'ready',
          source: resolved.source,
          ctx: resolved.payload,
          tenantName: null,
        });
        return;
      }

      /* 4. Env fallback — VITE_API_BASE_URL already configured. */
      if (hasBackend()) {
        setState({ status: 'ready', source: 'env', ctx: null, tenantName: null });
        return;
      }

      /* Nothing resolvable — user must start from the bot. */
      setState({ status: 'missing', source: null, ctx: null, tenantName: null });
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

/*
|--------------------------------------------------------------------------
| Tenant Context
|--------------------------------------------------------------------------
| Resolves WHICH tenant business this launch belongs to, then initializes
| tenant-owned UI configuration before the app shell is allowed to mount.
|
| Startup state:
|   loading — no business_type yet; render only AppInitialLoader
|   ready   — API succeeded, or the registry fallback was intentionally used
|   error   — no tenant route/config can be resolved
|
| Config precedence:
|   1. Tenant API (/telegram/branding, including business_type)
|   2. tenants.json only when that API fails
*/
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolveTenantContext, isInsideTelegram } from '../lib/tenantContext';
import { loadTenantRegistry, detectBotId, findTenantByBotId } from '../lib/tenantRegistry';
import { normalizeBusinessType } from '../lib/businessType';
import { DEFAULT_BRANDING, normalizeBranding } from '../lib/branding';
import {
  configureApiBusinessType,
  configureApiClient,
  fetchTenantConfig,
  hasBackend,
} from '../api/client';

const TenantContext = createContext(null);

const INITIAL_STATE = {
  status: 'loading', // 'loading' | 'ready' | 'error'
  source: null,
  ctx: null,
  tenantName: null,
  botId: null,
  registryTheme: null,
  businessType: null,
  branding: DEFAULT_BRANDING,
};

let tenantInitializationPromise = null;

function getTenantInitialization() {
  if (!tenantInitializationPromise) {
    tenantInitializationPromise = initializeTenant();
  }
  return tenantInitializationPromise;
}

function errorState(overrides = {}) {
  return {
    ...INITIAL_STATE,
    status: 'error',
    ...overrides,
  };
}

async function initializeTenant() {
  /* Registry + deep link resolve in parallel; bot id detection needs
     the registry's candidate ids (signature identification), but it is
     local crypto and does not hit the tenant backend. */
  const [tenants, resolved] = await Promise.all([
    loadTenantRegistry(),
    resolveTenantContext(),
  ]);

  const botId = await detectBotId(tenants);

  let route = null;
  let fallbackTenant = null;

  /* Registry/deep-link/env only decide where the tenant API lives.
     UI config is still withheld until that API finishes. */
  const registryEntry = findTenantByBotId(tenants, botId);
  if (registryEntry) {
    route = {
      source: 'registry',
      u: registryEntry.baseUrl,
      b: resolved?.payload?.b,
      tenantName: registryEntry.name,
    };
    fallbackTenant = registryEntry;
  } else if (resolved) {
    route = {
      source: resolved.source,
      u: resolved.payload.u,
      b: resolved.payload.b,
      tenantName: null,
    };
  } else if (hasBackend()) {
    route = {
      source: 'env',
      u: null,
      b: null,
      tenantName: null,
    };
  } else {
    const single = tenants.length === 1 ? findTenantByBotId(tenants, tenants[0].telegram_bot_id) : null;
    if (single && isInsideTelegram()) {
      console.warn('Tenant resolution: falling back to the single registry tenant for API routing.');
      route = {
        source: 'registry-single',
        u: single.baseUrl,
        b: null,
        tenantName: single.name,
      };
      fallbackTenant = single;
    }
  }

  if (!route) {
    return errorState({ botId });
  }

  if (route.u) {
    configureApiClient({ u: route.u, b: route.b });
  }

  const apiPayload = hasBackend() ? await fetchTenantConfig() : null;

  if (apiPayload) {
    const businessType = normalizeBusinessType(apiPayload.business_type ?? apiPayload.businessType);
    configureApiBusinessType(businessType);
    return {
      status: 'ready',
      source: route.source,
      ctx: route.u ? { u: route.u, b: route.b ?? null } : null,
      tenantName: route.tenantName,
      botId,
      registryTheme: null,
      businessType,
      branding: normalizeBranding(apiPayload),
    };
  }

  if (fallbackTenant) {
    configureApiBusinessType(fallbackTenant.businessType);
    return {
      status: 'ready',
      source: `${route.source}-fallback`,
      ctx: route.u ? { u: route.u, b: route.b ?? null } : null,
      tenantName: route.tenantName,
      botId: botId ?? (route.source === 'registry-single' ? String(tenants[0].telegram_bot_id) : null),
      registryTheme: fallbackTenant.theme ?? null,
      businessType: fallbackTenant.businessType,
      branding: normalizeBranding(fallbackTenant.theme),
    };
  }

  return errorState({
    source: route.source,
    ctx: route.u ? { u: route.u, b: route.b ?? null } : null,
    tenantName: route.tenantName,
    botId,
  });
}

export function TenantProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    getTenantInitialization()
      .then((nextState) => {
        if (!cancelled) setState(nextState);
      })
      .catch((error) => {
        console.warn('Tenant initialization failed:', error);
        if (!cancelled) setState(errorState());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      isLoading: state.status === 'loading',
      isInitializing: state.status === 'loading',
      isResolving: state.status === 'loading',
      isError: state.status === 'error',
      isMissing: state.status === 'error',
      branchId: state.ctx?.b ?? null,
      registryTheme: state.registryTheme,
      businessType: state.businessType,
      tenantInitialized: state.status === 'ready',
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

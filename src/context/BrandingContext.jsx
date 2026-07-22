/*
|--------------------------------------------------------------------------
| Branding Context
|--------------------------------------------------------------------------
| Fetches the tenant theme once the tenant resolves, applies it to the
| CSS variables immediately, and exposes it (name, tagline, logo) to the
| header. Falls back to the default سفرة palette on any failure — the
| app is fully usable before/without branding.
*/
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchBranding, hasBackend } from '../api/client';
import { DEFAULT_BRANDING, normalizeBranding, applyBranding } from '../lib/branding';
import { useTenant } from './TenantContext';

const BrandingContext = createContext(null);

export function BrandingProvider({ children }) {
  const tenant = useTenant();
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  useEffect(() => {
    if (tenant.status !== 'ready' || !hasBackend()) {
      applyBranding(DEFAULT_BRANDING);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const payload = await fetchBranding();
      if (cancelled) return;
      const normalized = normalizeBranding(payload);
      setBranding(normalized);
      applyBranding(normalized);
    })();

    return () => {
      cancelled = true;
    };
  }, [tenant.status]);

  const value = useMemo(() => ({ branding }), [branding]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside <BrandingProvider>');
  return ctx;
}

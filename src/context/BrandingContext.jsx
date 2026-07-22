/*
|--------------------------------------------------------------------------
| Branding Context
|--------------------------------------------------------------------------
| Fetches the tenant theme BEFORE the app content shows, so the splash
| and every screen paint in the tenant colors from the first frame — no
| green-then-recolor flash.
|
| Status:
|   'loading' — fetch in flight; the app shows the pre-boot loader
|   'ready'   — branding applied to CSS vars + Telegram chrome
|   'error'   — fetch failed; the app shows a "sorry" error screen
|
| Colors are applied to the document CSS variables the instant they
| arrive, so children mount already themed.
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchBranding, hasBackend } from '../api/client';
import { DEFAULT_BRANDING, normalizeBranding, applyBranding } from '../lib/branding';
import { useTenant } from './TenantContext';
import { useTelegram } from '../hooks/useTelegram';

const BrandingContext = createContext(null);

export function BrandingProvider({ children }) {
  const tenant = useTenant();
  const { setThemeColors } = useTelegram();
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  /** Apply a branding object to CSS vars + native Telegram chrome. */
  const apply = useCallback(
    (b) => {
      applyBranding(b);
      setThemeColors({ header: b.primary_color, background: b.background_color });
    },
    [setThemeColors],
  );

  const load = useCallback(async () => {
    setStatus('loading');

    /* No backend configured (browser dev): use defaults, don't error. */
    if (!hasBackend()) {
      setBranding(DEFAULT_BRANDING);
      apply(DEFAULT_BRANDING);
      setStatus('ready');
      return;
    }

    const payload = await fetchBranding();

    /* fetchBranding returns null on any failure (network / 4xx / 5xx). */
    if (payload === null) {
      setStatus('error');
      return;
    }

    const normalized = normalizeBranding(payload);
    setBranding(normalized);
    apply(normalized);
    setStatus('ready');
  }, [apply]);

  useEffect(() => {
    if (tenant.status !== 'ready') return;
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant.status, load]);

  const value = useMemo(
    () => ({
      branding,
      status,
      isLoading: status === 'loading',
      isError: status === 'error',
      reload: load,
    }),
    [branding, status, load],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside <BrandingProvider>');
  return ctx;
}

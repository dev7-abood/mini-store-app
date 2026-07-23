/*
|--------------------------------------------------------------------------
| Branding Context
|--------------------------------------------------------------------------
| Fetches the tenant theme BEFORE the app content shows, so the splash
| and every screen paint in the tenant colors from the first frame — no
| default-then-recolor flash.
|
| PRECEDENCE (highest wins):
|   1. tenants.json `theme`  — the registry is authoritative. Anything
|      it defines is final and never overwritten.
|   2. /telegram/branding API — fills only what the registry omits
|      (typically logo_url, tagline, text_color).
|   3. DEFAULT_BRANDING       — neutral last resort.
|
| Because the registry is read first AND wins, the colors painted on the
| very first frame are the colors that stay — the API can never recolor
| the UI mid-launch.
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

  const load = useCallback(
    async (registryTheme) => {
      setStatus('loading');

      /* No backend configured (browser dev): registry theme alone. */
      if (!hasBackend()) {
        const local = normalizeBranding(registryTheme);
        setBranding(local);
        apply(local);
        setStatus('ready');
        return;
      }

      const payload = await fetchBranding();

      /* fetchBranding returns null on any failure (network / 4xx / 5xx). */
      if (payload === null) {
        /* API down but the registry has a theme — the app can still run
           fully branded; only logo/tagline are missing. */
        if (registryTheme) {
          const local = normalizeBranding(registryTheme);
          setBranding(local);
          apply(local);
          setStatus('ready');
          return;
        }
        setStatus('error');
        return;
      }

      /* Registry LAST in the spread => registry wins every key it
         defines; the API supplies only what the registry omitted. */
      const merged = normalizeBranding({ ...payload, ...(registryTheme ?? {}) });
      setBranding(merged);
      apply(merged);
      setStatus('ready');
    },
    [apply],
  );

  /* Instant paint: the moment the tenant resolves, apply any colors the
     registry (tenants.json) carries — so the loader and splash show the
     tenant's colors with ZERO network wait. The API fetch then fills in
     the full branding (logo, tagline, precise palette). */
  useEffect(() => {
    if (tenant.status !== 'ready') return;

    /* Instant paint from the registry — these colors are final, so the
       first painted frame already shows what the user will keep seeing. */
    if (tenant.registryTheme) {
      const seeded = normalizeBranding(tenant.registryTheme);
      setBranding(seeded);
      apply(seeded);
    }

    let cancelled = false;
    (async () => {
      if (!cancelled) await load(tenant.registryTheme);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant.status, tenant.registryTheme, load, apply]);

  const value = useMemo(
    () => ({
      branding,
      status,
      isLoading: status === 'loading',
      isError: status === 'error',
      reload: () => load(tenant.registryTheme),
    }),
    [branding, status, load, tenant.registryTheme],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside <BrandingProvider>');
  return ctx;
}

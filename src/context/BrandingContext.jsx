/*
|--------------------------------------------------------------------------
| Branding Context
|--------------------------------------------------------------------------
| Fetches the tenant theme BEFORE the app content shows, so the splash
| and every screen paint in the tenant colors from the first frame — no
| default-then-recolor flash.
|
| PRECEDENCE (highest wins):
|   1. /telegram/branding API — what the merchant configured in the
|      admin panel. Wins for every key it actually returns.
|   2. tenants.json `theme`   — the per-tenant default shipped with the
|      app; used for keys the merchant has never configured (the API
|      returns null for those, so they don't overwrite).
|   3. DEFAULT_BRANDING       — neutral last resort.
|
| The registry theme is applied instantly on tenant resolution so the
| first frame is already tenant-coloured; the API response then refines
| it. When the merchant hasn't branded anything (is_configured: false),
| the registry values simply stand — no flash, because they match.
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
import { DEFAULT_BRANDING, normalizeBranding, resolveBranding, applyBranding } from '../lib/branding';
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

      /* API LAST => configured values win; nulls (unconfigured keys)
         are dropped so the registry default stands for those. */
      const merged = resolveBranding({ registryTheme, apiPayload: payload });
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

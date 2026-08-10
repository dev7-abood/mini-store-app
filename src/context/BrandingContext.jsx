/*
|--------------------------------------------------------------------------
| Branding Context
|--------------------------------------------------------------------------
| Applies the already-initialized tenant branding to CSS variables and
| Telegram chrome. Fetching happens in TenantProvider so the app has one
| startup source of truth and no branded UI mounts before tenant config
| is ready.
*/
import { createContext, useCallback, useContext, useLayoutEffect, useMemo } from 'react';
import { DEFAULT_BRANDING, applyBranding } from '../lib/branding';
import { useTenant } from './TenantContext';
import { useTelegram } from '../hooks/useTelegram';

const BrandingContext = createContext(null);

export function BrandingProvider({ children }) {
  const tenant = useTenant();
  const { setThemeColors } = useTelegram();
  const branding = tenant.branding ?? DEFAULT_BRANDING;
  const status = tenant.status === 'ready' ? 'ready' : tenant.status === 'error' ? 'error' : 'loading';

  /** Apply a branding object to CSS vars + native Telegram chrome. */
  const apply = useCallback(
    (b) => {
      applyBranding(b);
      setThemeColors({ header: b.primary_color, background: b.background_color });
    },
    [setThemeColors],
  );

  useLayoutEffect(() => {
    if (tenant.status !== 'ready') return;
    apply(branding);
  }, [tenant.status, branding, apply]);

  const value = useMemo(
    () => ({
      branding,
      status,
      isLoading: status === 'loading',
      isError: status === 'error',
      reload: () => window.location.reload(),
    }),
    [branding, status],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside <BrandingProvider>');
  return ctx;
}

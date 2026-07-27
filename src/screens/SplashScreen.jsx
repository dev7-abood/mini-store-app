import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../context/CatalogContext';
import { useBranding } from '../context/BrandingContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import BrandLogo from '../components/BrandLogo';
import styles from './SplashScreen.module.css';

/* Minimum splash time is per-branch (branding.splash.duration); these
   are the fallbacks and the hard limits around it. */
const DEFAULT_MIN_SPLASH_MS = 900;
const SKIP_AFTER_MS = 2500; // manual escape hatch for slow networks
const FORCE_MS = 6000; // the splash never hangs — menu shows skeletons

/*
|--------------------------------------------------------------------------
| Splash Screen (white-label)
|--------------------------------------------------------------------------
| Full-screen branded boot: tenant PRIMARY color fills the background,
| the tenant's transparent logo sits centered in a soft halo, a modern
| pulsing loader runs beneath, then it fades out into the menu once the
| catalog has loaded. All colors come from branding — nothing hardcoded.
*/
export default function SplashScreen() {
  const { t } = useTranslation();
  const { isLoading } = useCatalog();
  const { branding } = useBranding();
  const { navigate } = useNavigation();
  const [minElapsed, setMinElapsed] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [leaving, setLeaving] = useState(false);

  /* Per-branch minimum, clamped so a bad value can't strand the
     customer on the splash. */
  const minSplashMs = Math.min(
    Math.max(Number(branding.splash?.duration) || DEFAULT_MIN_SPLASH_MS, 0),
    FORCE_MS,
  );

  useEffect(() => {
    /* The branch can switch the splash off entirely — go straight in. */
    if (branding.splash?.enabled === false) {
      navigate(SCREENS.MENU);
      return undefined;
    }

    const minTimer = setTimeout(() => setMinElapsed(true), minSplashMs);
    const skipTimer = setTimeout(() => setShowSkip(true), SKIP_AFTER_MS);
    const forceTimer = setTimeout(() => go(), FORCE_MS);
    return () => [minTimer, skipTimer, forceTimer].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minSplashMs, branding.splash?.enabled]);

  /* Advance when the catalog is ready, after the minimum splash time. */
  useEffect(() => {
    if (!isLoading && minElapsed) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, minElapsed]);

  /** Fade out, then navigate — smooth transition into the app. */
  function go() {
    setLeaving(true);
    setTimeout(() => navigate(SCREENS.MENU), 420);
  }

  /* Drive the whole screen from branding via inline CSS variables so the
     background/halo/loader all use the tenant palette. */
  const themeVars = {
    '--splash-primary': branding.primary_color,
    '--splash-secondary': branding.secondary_color,
    '--splash-bg': branding.background_color,
  };

  return (
    <div
      className={`${styles.screen} ${leaving ? styles.leaving : ''}`}
      style={themeVars}
    >
      {/* Secondary-color glow accents (optional brand effect) */}
      <div className={styles.glowTop} aria-hidden="true" />
      <div className={styles.glowBottom} aria-hidden="true" />

      <div className={styles.center}>
        <div className={styles.halo}>
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt=""
              className={styles.logo}
              /* Branch-configured size, scaled up for the splash where
                 the logo is the hero rather than a header mark. */
              style={{
                width: `${Math.round((Number(branding.logo_size) || 64) * 1.5)}px`,
                height: `${Math.round((Number(branding.logo_size) || 64) * 1.5)}px`,
              }}
            />
          ) : (
            <BrandLogo variant="light" size={92} />
          )}
        </div>

        <div className={styles.name}>{branding.name}</div>
        <div className={styles.tag}>{branding.tagline}</div>

        {/* Modern pulsing loader */}
        <div className={styles.loader} aria-label={t('splash.loading')}>
          <span />
          <span />
          <span />
        </div>
      </div>

      {showSkip && (
        <button type="button" className={styles.skip} onClick={go}>
          {t('splash.skip')}
        </button>
      )}
    </div>
  );
}

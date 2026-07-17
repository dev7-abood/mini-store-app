import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../context/CatalogContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import Screen from '../components/ui/Screen';
import BrandLogo from '../components/BrandLogo';
import styles from './SplashScreen.module.css';

const MIN_SPLASH_MS = 900; // keep the branding visible at least this long
const SKIP_AFTER_MS = 2500; // manual escape hatch for slow networks
const FORCE_MS = 6000; // the splash never hangs — menu shows skeletons

/** Branded boot screen; advances once the catalog has actually loaded. */
export default function SplashScreen() {
  const { t } = useTranslation();
  const { isLoading } = useCatalog();
  const { navigate } = useNavigation();
  const [minElapsed, setMinElapsed] = useState(false);
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    const minTimer = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    const skipTimer = setTimeout(() => setShowSkip(true), SKIP_AFTER_MS);
    const forceTimer = setTimeout(() => navigate(SCREENS.MENU), FORCE_MS);
    return () => [minTimer, skipTimer, forceTimer].forEach(clearTimeout);
  }, [navigate]);

  /* Advance when the catalog is ready (or fell back to the seed). */
  useEffect(() => {
    if (!isLoading && minElapsed) navigate(SCREENS.MENU);
  }, [isLoading, minElapsed, navigate]);

  return (
    <Screen>
      <div className={styles.inner}>
        <div className={styles.plate}>
          <BrandLogo size={66} />
        </div>
        <div>
          <div className={styles.name}>{t('brand.name')}</div>
          <div className={styles.tag}>{t('brand.tagline')}</div>
        </div>
        <div className={styles.dots}>
          <span />
          <span />
          <span />
        </div>
        <div className={styles.loading}>{t('splash.loading')}</div>
        {showSkip && (
          <button type="button" className={styles.skip} onClick={() => navigate(SCREENS.MENU)}>
            {t('splash.skip')}
          </button>
        )}
      </div>
    </Screen>
  );
}

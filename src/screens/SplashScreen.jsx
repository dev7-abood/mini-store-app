import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import Screen from '../components/ui/Screen';
import BrandLogo from '../components/BrandLogo';
import styles from './SplashScreen.module.css';

const BOOT_MS = 1500; // simulated catalog load
const SKIP_AFTER_MS = 2500; // safety escape hatch if boot ever hangs
const FORCE_MS = 5000;

/** Branded boot screen; auto-advances to the menu after the fake load. */
export default function SplashScreen() {
  const { t } = useTranslation();
  const { navigate } = useNavigation();
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    const boot = setTimeout(() => navigate(SCREENS.MENU), BOOT_MS);
    const skip = setTimeout(() => setShowSkip(true), SKIP_AFTER_MS);
    const force = setTimeout(() => navigate(SCREENS.MENU), FORCE_MS);
    return () => [boot, skip, force].forEach(clearTimeout);
  }, [navigate]);

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

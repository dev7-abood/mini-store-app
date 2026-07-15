import { useTranslation } from 'react-i18next';
import { useOrder } from '../context/OrderContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import Screen from '../components/ui/Screen';
import CenterIllustration from '../components/ui/CenterIllustration';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './SuccessScreen.module.css';

/** Order confirmed screen with the generated order number. */
export default function SuccessScreen() {
  const { t } = useTranslation();
  const { orderNumber } = useOrder();
  const { navigate } = useNavigation();

  return (
    <Screen>
      <div className={styles.wrap}>
        <div className={styles.check}>
          <svg viewBox="0 0 52 52" fill="none" width="52" height="52" aria-hidden="true">
            <path
              d="M12 27l10 10 18-20"
              stroke="#fff"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <CenterIllustration heading={t('success.heading')}>{t('success.body')}</CenterIllustration>
        <div style={{ textAlign: 'center' }}>
          <span className={styles.chip}>🧾 {orderNumber}</span>
        </div>
      </div>
      <FixedCta>
        <Button full onClick={() => navigate(SCREENS.STATUS)}>
          {t('success.track')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

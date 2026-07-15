import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrder } from '../context/OrderContext';
import { useCart } from '../context/CartContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import OrderTimeline, { ORDER_STEPS } from '../components/OrderTimeline';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './StatusScreen.module.css';

/**
 * Simulated live-status timeline. In production, drive `step` from a
 * websocket / polling endpoint instead of timers.
 */
const STEP_DELAYS_MS = [3500, 8000, 13000];

export default function StatusScreen() {
  const { t } = useTranslation();
  const { orderNumber, resetOrder } = useOrder();
  const { clearCart } = useCart();
  const { navigate } = useNavigation();
  const { haptic } = useTelegram();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = STEP_DELAYS_MS.map((delay, index) =>
      setTimeout(() => setStep(index + 1), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  /* Celebrate delivery. */
  useEffect(() => {
    if (step === ORDER_STEPS.length - 1) haptic('heavy');
  }, [step, haptic]);

  const delivered = step >= ORDER_STEPS.length - 1;
  const eta = delivered ? '🎉' : step >= 2 ? t('status.etaOnTheWay') : t('status.etaInitial');

  const orderAgain = () => {
    clearCart();
    resetOrder();
    navigate(SCREENS.MENU);
  };

  return (
    <Screen>
      <SubHeader
        title={t('status.title')}
        showBack={false}
        trailing={<span className={styles.chip}>{orderNumber}</span>}
      />
      <div className={styles.eta}>
        ⏱ {t('status.eta')} · <span>{eta}</span>
      </div>
      <OrderTimeline currentStep={delivered ? ORDER_STEPS.length : step} />
      <FixedCta>
        <Button variant="green" full onClick={orderAgain}>
          {t('status.orderAgain')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

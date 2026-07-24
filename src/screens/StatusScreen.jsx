import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrder } from '../context/OrderContext';
import { useCart } from '../context/CartContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { useTelegram } from '../hooks/useTelegram';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import OrderTimeline, { ORDER_STEPS } from '../components/OrderTimeline';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './StatusScreen.module.css';

/*
|--------------------------------------------------------------------------
| Order Status
|--------------------------------------------------------------------------
| Driven by the server: the order is re-read on mount and every
| REFRESH_MS while it is still in flight, and its `status` string maps
| onto the visual timeline. Terminal states stop the polling.
|
| Without a backend the screen falls back to the original simulated
| timeline so the demo path still animates.
*/
const REFRESH_MS = 15000;

/** Server status -> timeline index. Unknown states hold at step 0. */
const STATUS_STEPS = {
  pending: 0,
  unverified: 0,
  awaiting_payment: 0,
  confirmed: 1,
  accepted: 1,
  preparing: 1,
  ready: 2,
  out_for_delivery: 2,
  on_the_way: 2,
  delivered: 3,
  completed: 3,
};

/** Statuses that mean "stop polling". */
const TERMINAL = new Set(['delivered', 'completed', 'cancelled', 'canceled', 'rejected', 'failed']);

/** Fallback animation timings when no backend is configured. */
const STEP_DELAYS_MS = [3500, 8000, 13000];

export default function StatusScreen() {
  const { t } = useTranslation();
  const { orderNumber, resetOrder } = useOrder();
  const { clearCart } = useCart();
  const { navigate } = useNavigation();
  const { haptic, notify } = useTelegram();
  const { order, payment, refresh, cancel, retryPayment, isBusy } = useOrderFlow();
  const [step, setStep] = useState(0);

  const serverStatus = order?.status ?? null;

  /* Server-driven: map the status onto the timeline and keep polling
     until the order reaches a terminal state. */
  useEffect(() => {
    if (!serverStatus) return undefined;

    setStep(STATUS_STEPS[String(serverStatus).toLowerCase()] ?? 0);

    if (TERMINAL.has(String(serverStatus).toLowerCase())) return undefined;

    const timer = setInterval(() => refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [serverStatus, refresh]);

  /* Demo fallback: animate only when there is no server order at all. */
  useEffect(() => {
    if (serverStatus) return undefined;

    const timers = STEP_DELAYS_MS.map((delay, index) =>
      setTimeout(() => setStep(index + 1), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [serverStatus]);

  /** Cancel the order after confirming. */
  const cancelCurrentOrder = async () => {
    haptic('rigid');
    const ok = await cancel();
    notify(ok ? t('status.cancelled') : t('status.cancelFailed'));
  };

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

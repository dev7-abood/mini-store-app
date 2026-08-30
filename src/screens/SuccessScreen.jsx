import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOrder } from '../context/OrderContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import Screen from '../components/ui/Screen';
import CenterIllustration from '../components/ui/CenterIllustration';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './SuccessScreen.module.css';

/*
| Order confirmed. A payment made outside the app normally routes to its
| instructions instead of here, so this screen only mentions the pending
| store confirmation for the case where the customer arrives anyway —
| and it keys that off `awaitingConfirmation`, the one field that means
| "a person still has to confirm this", never off the method.
*/
export default function SuccessScreen() {
  const { t } = useTranslation();
  const { orderNumber } = useOrder();
  const { order, payment } = useOrderFlow();
  const navigate = useNavigate();

  const activePayment = payment ?? order?.payment ?? null;
  const hasInstructions = Boolean(activePayment?.instructions);
  /* `awaitingConfirmation` is the field that means this, but the block
     the verify call returns is the push result and does not carry it
     yet. Unpaid transfer instructions mean the same thing here, and the
     unpaid half is still read from `isPaid`, never from the presence of
     the instructions alone. */
  const awaitingStore =
    Boolean(activePayment?.awaitingConfirmation)
    || (hasInstructions && !activePayment?.isPaid);

  const trackOrder = () => {
    if (!orderNumber) return;
    navigate(`/orders/${encodeURIComponent(orderNumber)}`);
  };

  const openInstructions = () => {
    if (!orderNumber) return;
    navigate(`/orders/${encodeURIComponent(orderNumber)}/payment`);
  };

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
        <CenterIllustration heading={t(awaitingStore ? 'success.awaitingHeading' : 'success.heading')}>
          {t(awaitingStore ? 'success.awaitingBody' : 'success.body')}
        </CenterIllustration>
        <div style={{ textAlign: 'center' }}>
          <span className={styles.chip}>🧾 {orderNumber}</span>
        </div>
      </div>
      <FixedCta>
        {hasInstructions ? (
          <Button variant="green" full onClick={openInstructions} disabled={!orderNumber}>
            {t('success.viewInstructions')}
          </Button>
        ) : (
          <Button full onClick={trackOrder} disabled={!orderNumber}>
            {t('success.track')}
          </Button>
        )}
      </FixedCta>
    </Screen>
  );
}

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOrder } from '../context/OrderContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { findPaymentMethod } from '../lib/paymentMethods';
import { normalizeStatusValue } from '../lib/orderStatus';
import Screen from '../components/ui/Screen';
import CenterIllustration from '../components/ui/CenterIllustration';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './SuccessScreen.module.css';

/** Order confirmed screen with the generated order number. */
export default function SuccessScreen() {
  const { t } = useTranslation();
  const { orderNumber, paymentMethod } = useOrder();
  const { order } = useOrderFlow();
  const navigate = useNavigate();
  const method = findPaymentMethod(order?.paymentMethod ?? paymentMethod);
  const proofSubmitted =
    method?.type === 'manual'
    && normalizeStatusValue(order?.paymentStatus ?? order?.status) === 'awaiting_verification';

  const trackOrder = () => {
    if (!orderNumber) return;
    navigate(`/orders/${encodeURIComponent(orderNumber)}`);
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
        <CenterIllustration heading={t(proofSubmitted ? 'success.manualHeading' : 'success.heading')}>
          {t(proofSubmitted ? 'success.manualBody' : 'success.body')}
        </CenterIllustration>
        <div style={{ textAlign: 'center' }}>
          <span className={styles.chip}>🧾 {orderNumber}</span>
        </div>
      </div>
      <FixedCta>
        <Button full onClick={trackOrder} disabled={!orderNumber}>
          {t('success.track')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

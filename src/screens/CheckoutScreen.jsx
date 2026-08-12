import { useTranslation } from 'react-i18next';
import { useOrder } from '../context/OrderContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import { findPaymentMethod } from '../lib/paymentMethods';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import PaymentMethodPicker from '../components/PaymentMethodPicker';
import { StoreStatusNotice } from '../components/StoreStatus';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './CheckoutScreen.module.css';

/** Payment method selection only. Payment-specific details live downstream. */
export default function CheckoutScreen() {
  const { t } = useTranslation();
  const { paymentMethod, setPaymentMethod } = useOrder();
  const { canCheckout } = useStoreStatus();
  const { navigate } = useNavigation();
  const { notify } = useTelegram();
  const selectedMethod = findPaymentMethod(paymentMethod);

  const submit = () => {
    if (!canCheckout) {
      notify(t('storeStatus.closedFallback'));
      return;
    }

    if (selectedMethod?.type === 'manual') {
      navigate(SCREENS.MANUAL_PAYMENT);
      return;
    }

    navigate(SCREENS.SMART_PAYMENT);
  };

  return (
    <Screen>
      <SubHeader title={t('payment.selectTitle')} />
      <div className={styles.pad}>
        <section className={styles.paymentBlock} aria-labelledby="payment-method-title">
          <div className={styles.sectionHeader}>
            <h2 id="payment-method-title">{t('payment.title')}</h2>
            <p>{t('payment.selectBody')}</p>
          </div>
          <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
        </section>
      </div>
      <StoreStatusNotice />
      <FixedCta>
        <Button variant="green" full onClick={submit} disabled={!canCheckout}>
          {canCheckout ? t('checkout.continue') : t('storeStatus.closedCheckout')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

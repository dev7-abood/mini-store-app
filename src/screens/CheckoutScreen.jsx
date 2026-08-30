import { useTranslation } from 'react-i18next';
import { useOrder } from '../context/OrderContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import { usePaymentMethods } from '../context/PaymentMethodsContext';
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
  const { findPaymentMethod, hasMethods, isLoading } = usePaymentMethods();
  const selectedMethod = findPaymentMethod(paymentMethod);

  const submit = () => {
    if (!canCheckout) {
      notify(t('storeStatus.closedFallback'), 'warning');
      return;
    }

    /* Same next screen whatever the settlement — the details a checkout
       needs don't depend on how the money moves. */
    navigate(SCREENS.PAYMENT_DETAILS);
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
          {/* An empty list is a real answer: the store cannot take
              payment at all. Say so rather than show an empty chooser. */}
          {!hasMethods && !isLoading ? (
            <p className={styles.noMethods} role="status">{t('payment.noMethods')}</p>
          ) : (
            <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
          )}
        </section>
      </div>
      <StoreStatusNotice />
      <FixedCta>
        <Button variant="green" full onClick={submit} disabled={!canCheckout || !selectedMethod}>
          {canCheckout ? t('checkout.continue') : t('storeStatus.closedCheckout')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

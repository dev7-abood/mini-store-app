import { useTranslation } from 'react-i18next';
import { useOrder } from '../context/OrderContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import Field from '../components/ui/Field';
import PaymentMethodPicker from '../components/PaymentMethodPicker';
import { StoreStatusNotice } from '../components/StoreStatus';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './CheckoutScreen.module.css';

/** Delivery details form (name, address, kitchen note). */
export default function CheckoutScreen() {
  const { t } = useTranslation();
  const { details, updateDetails, paymentMethod, setPaymentMethod } = useOrder();
  const { canCheckout } = useStoreStatus();
  const { navigate } = useNavigation();
  const { notify } = useTelegram();

  const submit = () => {
    if (!canCheckout) {
      notify(t('storeStatus.closedFallback'));
      return;
    }

    if (!details.name.trim() || !details.address.trim()) {
      notify(t('checkout.missingFields'));
      return;
    }
    navigate(SCREENS.PHONE);
  };

  return (
    <Screen>
      <SubHeader title={t('checkout.title')} />
      <div className={styles.pad}>
        <Field
          label={t('checkout.nameLabel')}
          placeholder={t('checkout.namePlaceholder')}
          value={details.name}
          onChange={(e) => updateDetails({ name: e.target.value })}
        />
        <Field
          multiline
          label={t('checkout.addressLabel')}
          placeholder={t('checkout.addressPlaceholder')}
          value={details.address}
          onChange={(e) => updateDetails({ address: e.target.value })}
        />
        <Field
          label={t('checkout.noteLabel')}
          placeholder={t('checkout.notePlaceholder')}
          value={details.note}
          onChange={(e) => updateDetails({ note: e.target.value })}
        />

        {/* Payment method — sent to the API as `payment_method`. */}
        <div className={styles.paymentBlock}>
          <span className={styles.paymentLabel}>{t('payment.title')}</span>
          <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
        </div>
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

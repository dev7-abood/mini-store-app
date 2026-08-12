import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOrder } from '../context/OrderContext';
import { useCart } from '../context/CartContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import { createMockManualPaymentOrder } from '../lib/manualPaymentMockService';
import { isManualPaymentMethod } from '../lib/paymentMethods';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import Field from '../components/ui/Field';
import PaymentMethodPicker from '../components/PaymentMethodPicker';
import { StoreStatusNotice } from '../components/StoreStatus';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './CheckoutScreen.module.css';

const MIN_SENDER_NAME_LENGTH = 3;
const MIN_ACCOUNT_IDENTIFIER_LENGTH = 5;

function validateManualPaymentSender(sender, t) {
  const fullName = sender.fullName.trim();
  const accountIdentifier = sender.accountIdentifier.trim();
  const errors = {};

  if (!fullName) {
    errors.fullName = t('checkout.manualSender.errors.fullNameRequired');
  } else if (fullName.length < MIN_SENDER_NAME_LENGTH) {
    errors.fullName = t('checkout.manualSender.errors.fullNameShort');
  }

  if (!accountIdentifier) {
    errors.accountIdentifier = t('checkout.manualSender.errors.accountRequired');
  } else if (accountIdentifier.replace(/\s/g, '').length < MIN_ACCOUNT_IDENTIFIER_LENGTH) {
    errors.accountIdentifier = t('checkout.manualSender.errors.accountShort');
  } else if (!/^[\p{L}\p{N}\s+_.-]+$/u.test(accountIdentifier)) {
    errors.accountIdentifier = t('checkout.manualSender.errors.accountInvalid');
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    value: { fullName, accountIdentifier },
  };
}

function ManualPaymentSenderFields({ value, errors, onChange, t }) {
  return (
    <section className={styles.senderCard} aria-labelledby="manual-payment-sender-title">
      <div className={styles.senderHeader}>
        <span className={styles.senderBadge}>{t('checkout.manualSender.fromBadge')}</span>
        <div>
          <h2 id="manual-payment-sender-title">{t('checkout.manualSender.title')}</h2>
          <p>{t('checkout.manualSender.helper')}</p>
        </div>
      </div>

      <div className={styles.senderFields}>
        <div className={styles.senderField}>
          <label htmlFor="manual-sender-name">{t('checkout.manualSender.fullName')}</label>
          <input
            id="manual-sender-name"
            value={value.fullName}
            onChange={(event) => onChange({ fullName: event.target.value })}
            placeholder={t('checkout.manualSender.fullNamePlaceholder')}
            autoComplete="name"
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? 'manual-sender-name-error' : undefined}
          />
          {errors.fullName && (
            <p id="manual-sender-name-error" className={styles.errorText}>
              {errors.fullName}
            </p>
          )}
        </div>

        <div className={styles.senderField}>
          <label htmlFor="manual-sender-account">{t('checkout.manualSender.accountIdentifier')}</label>
          <input
            id="manual-sender-account"
            value={value.accountIdentifier}
            onChange={(event) => onChange({ accountIdentifier: event.target.value })}
            placeholder={t('checkout.manualSender.accountPlaceholder')}
            inputMode="text"
            autoComplete="off"
            dir="ltr"
            aria-invalid={Boolean(errors.accountIdentifier)}
            aria-describedby={errors.accountIdentifier ? 'manual-sender-account-error' : undefined}
          />
          {errors.accountIdentifier && (
            <p id="manual-sender-account-error" className={styles.errorText}>
              {errors.accountIdentifier}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Delivery details form (name, address, kitchen note). */
export default function CheckoutScreen() {
  const { t } = useTranslation();
  const {
    details,
    updateDetails,
    paymentMethod,
    setPaymentMethod,
    manualPaymentSender,
    updateManualPaymentSender,
    confirmOrder,
  } = useOrder();
  const { entries, total } = useCart();
  const { canCheckout } = useStoreStatus();
  const { navigate } = useNavigation();
  const routeNavigate = useNavigate();
  const { notify } = useTelegram();
  const manualSelected = isManualPaymentMethod(paymentMethod);
  const manualSenderValidation = validateManualPaymentSender(manualPaymentSender, t);

  const submit = () => {
    if (!canCheckout) {
      notify(t('storeStatus.closedFallback'));
      return;
    }

    if (!details.name.trim() || !details.address.trim()) {
      notify(t('checkout.missingFields'));
      return;
    }

    if (manualSelected) {
      if (!manualSenderValidation.isValid) return;

      const order = createMockManualPaymentOrder({
        entries,
        total,
        paymentMethodId: paymentMethod,
        manualPaymentSender: manualSenderValidation.value,
      });
      confirmOrder(order.orderNumber);
      routeNavigate(`/orders/${encodeURIComponent(order.id)}/payment/pending`);
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

        {/* Payment method - sent to the API as `payment_method`. */}
        <div className={styles.paymentBlock}>
          <span className={styles.paymentLabel}>{t('payment.title')}</span>
          <PaymentMethodPicker
            value={paymentMethod}
            onChange={setPaymentMethod}
            renderSelectedAddon={(method) =>
              method.type === 'manual' ? (
                <ManualPaymentSenderFields
                  value={manualPaymentSender}
                  errors={manualSenderValidation.errors}
                  onChange={updateManualPaymentSender}
                  t={t}
                />
              ) : null}
          />
        </div>
      </div>
      <StoreStatusNotice />
      <FixedCta>
        <Button
          variant="green"
          full
          onClick={submit}
          disabled={!canCheckout || (manualSelected && !manualSenderValidation.isValid)}
        >
          {canCheckout ? t('checkout.continue') : t('storeStatus.closedCheckout')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

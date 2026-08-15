import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrder, PHONE_PREFIX } from '../context/OrderContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { usePaymentMethods } from '../context/PaymentMethodsContext';
import { useTelegram } from '../hooks/useTelegram';
import { formatLocalPhone, LOCAL_DIGITS } from '../lib/phone';
import { paymentMethodLabel } from '../lib/paymentMethods';
import { validateSmartPaymentDetails } from '../lib/paymentDetailsValidation';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import Field from '../components/ui/Field';
import FlagPS from '../components/ui/FlagPS';
import PaymentMethodHeader from '../components/payment/PaymentMethodHeader';
import { StoreStatusNotice } from '../components/StoreStatus';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './SmartPaymentScreen.module.css';

function PhoneField({ label, hint, error, value, onChange, onBlur, inputRef }) {
  const descriptionId = error || hint ? 'smart-payment-phone-description' : undefined;

  return (
    <div className={styles.fieldBlock}>
      <label className={styles.label} htmlFor="smart-payment-phone">
        {label}
      </label>
      <div className={`${styles.phoneField} ${error ? styles.invalidField : ''}`}>
        <span className={styles.prefix}>
          <FlagPS />
          {PHONE_PREFIX}
        </span>
        <input
          ref={inputRef}
          id="smart-payment-phone"
          className={styles.input}
          placeholder="598 304 517"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="next"
          maxLength={LOCAL_DIGITS + 2}
          value={value}
          onChange={(event) => onChange(formatLocalPhone(event.target.value))}
          onBlur={onBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
          required
        />
      </div>
      {error ? (
        <p id={descriptionId} className={styles.errorText}>
          {error}
        </p>
      ) : hint ? (
        <p id={descriptionId} className={styles.hintText}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Smart payment details: these belong to the person who will approve and
 * send the Jawwal Pay payment.
 */
export default function SmartPaymentScreen() {
  const { t } = useTranslation();
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const addressRef = useRef(null);
  const {
    phone,
    setPhone,
    details,
    updateDetails,
    fullPhone,
    fullDeliveryPhone,
    paymentMethod,
  } = useOrder();
  const { navigate } = useNavigation();
  const { notify } = useTelegram();
  const { place, isBusy } = useOrderFlow();
  const { findPaymentMethod } = usePaymentMethods();
  const { canCheckout, refresh: refreshStoreStatus } = useStoreStatus();
  const [isCheckingStore, setIsCheckingStore] = useState(false);
  const [touched, setTouched] = useState({ fullName: false, phone: false, address: false });

  const method = findPaymentMethod(paymentMethod) ?? findPaymentMethod('jawwalpay');
  const methodLabel = paymentMethodLabel(method, t) || t('payment.jawwalpay.label');
  const paymentValidation = validateSmartPaymentDetails(
    { fullName: details.name, phone, address: details.address },
    t,
  );
  const visibleErrors = {
    fullName: touched.fullName ? paymentValidation.errors.fullName : '',
    phone: touched.phone ? paymentValidation.errors.phone : '',
    address: touched.address ? paymentValidation.errors.address : '',
  };

  const sendCode = async () => {
    if (!canCheckout) {
      notify(t('storeStatus.closedFallback'));
      return;
    }

    setTouched({ fullName: true, phone: true, address: true });

    if (!paymentValidation.isValid) {
      notify(t('smartPayment.invalid'));
      if (paymentValidation.errors.fullName) {
        nameRef.current?.focus();
      } else if (paymentValidation.errors.phone) {
        phoneRef.current?.focus();
      } else {
        addressRef.current?.focus();
      }
      return;
    }

    setIsCheckingStore(true);
    const latestStatus = await refreshStoreStatus();
    setIsCheckingStore(false);

    if (latestStatus && latestStatus.canCheckout === false) {
      notify(t('storeStatus.closedFallback'));
      return;
    }

    const result = await place({
      name: paymentValidation.value.fullName,
      address: paymentValidation.value.address,
      phone: fullPhone,
      delivery_phone: fullDeliveryPhone,
      payment_method: paymentMethod,
    });

    if (!result.ok) {
      notify(
        result.code === 'STORE_CLOSED'
          ? t('storeStatus.closedFallback')
          : result.message || t('smartPayment.orderFailed'),
      );
      return;
    }

    navigate(SCREENS.OTP);
  };

  return (
    <Screen>
      <SubHeader title={t('smartPayment.title')} />
      <div className={styles.pad}>
        <section className={styles.paymentPanel} aria-labelledby="smart-payment-heading">
          <PaymentMethodHeader
            method={method}
            label={methodLabel}
            kicker={t('smartPayment.kicker')}
            headingId="smart-payment-heading"
          />

          <p className={styles.body}>{t('smartPayment.body')}</p>

          <div className={styles.fields}>
            <Field
              inputRef={nameRef}
              label={t('smartPayment.fullName')}
              placeholder={t('smartPayment.fullNamePlaceholder')}
              value={details.name}
              onChange={(event) => updateDetails({ name: event.target.value })}
              onBlur={() => setTouched((prev) => ({ ...prev, fullName: true }))}
              autoComplete="name"
              enterKeyHint="next"
              error={visibleErrors.fullName}
              required
            />

            <PhoneField
              label={t('smartPayment.phoneNumber')}
              hint={t('smartPayment.phoneHint')}
              error={visibleErrors.phone}
              value={phone}
              onChange={setPhone}
              onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
              inputRef={phoneRef}
            />

            <Field
              inputRef={addressRef}
              multiline
              rows={3}
              label={t('smartPayment.address')}
              placeholder={t('smartPayment.addressPlaceholder')}
              value={details.address}
              onChange={(event) => updateDetails({ address: event.target.value })}
              onBlur={() => setTouched((prev) => ({ ...prev, address: true }))}
              autoComplete="street-address"
              enterKeyHint="done"
              error={visibleErrors.address}
              required
            />
          </div>
        </section>
      </div>
      <StoreStatusNotice />
      <FixedCta>
        <Button variant="green" full onClick={sendCode} disabled={isBusy || isCheckingStore || !canCheckout}>
          {isBusy || isCheckingStore
            ? t('smartPayment.sending')
            : canCheckout
              ? t('checkout.continue')
              : t('storeStatus.closedCheckout')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

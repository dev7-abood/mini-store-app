import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrder, PHONE_PREFIX } from '../context/OrderContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { useTelegram } from '../hooks/useTelegram';
import {
  formatLocalPhone,
  isPalestinianMobileNumber,
  LOCAL_DIGITS,
} from '../lib/phone';
import { findPaymentMethod } from '../lib/paymentMethods';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import FlagPS from '../components/ui/FlagPS';
import { StoreStatusNotice } from '../components/StoreStatus';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './PhoneScreen.module.css';

const MIN_SENDER_NAME_LENGTH = 3;

function validateSmartPaymentSender(sender, t) {
  const fullName = sender.fullName.trim();
  const errors = {};

  if (!fullName) {
    errors.fullName = t('smartPayment.errors.fullNameRequired');
  } else if (fullName.length < MIN_SENDER_NAME_LENGTH) {
    errors.fullName = t('smartPayment.errors.fullNameShort');
  }

  if (!sender.phone.trim()) {
    errors.phone = t('smartPayment.errors.phoneRequired');
  } else if (!isPalestinianMobileNumber(sender.phone)) {
    errors.phone = t('smartPayment.errors.phoneInvalid');
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    value: { fullName },
  };
}

function PhoneField({ label, hint, error, value, onChange, onBlur, inputRef }) {
  const inputId = useId();
  const descriptionId = error || hint ? `${inputId}-description` : undefined;

  return (
    <div className={styles.fieldBlock}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={`${styles.phoneField} ${error ? styles.invalidField : ''}`}>
        <span className={styles.prefix}>
          <FlagPS />
          {PHONE_PREFIX}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          placeholder="598 304 517"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="done"
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
 * Smart payment details: the name and phone belong to the person who
 * will approve the Jawwal Pay request.
 */
export default function PhoneScreen() {
  const { t } = useTranslation();
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
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
  const {
    canCheckout,
    refresh: refreshStoreStatus,
  } = useStoreStatus();
  const [isCheckingStore, setIsCheckingStore] = useState(false);
  const [touched, setTouched] = useState({ fullName: false, phone: false });

  const method = findPaymentMethod(paymentMethod) ?? findPaymentMethod('jawwalpay');
  const methodLabel = method?.labelKey ? t(method.labelKey) : t('payment.jawwalpay.label');
  const methodLogo = method?.logo || '/payments/jawwalpay.png';
  const senderValidation = validateSmartPaymentSender({ fullName: details.name, phone }, t);
  const visibleErrors = {
    fullName: touched.fullName ? senderValidation.errors.fullName : '',
    phone: touched.phone ? senderValidation.errors.phone : '',
  };

  const sendCode = async () => {
    if (!canCheckout) {
      notify(t('storeStatus.closedFallback'));
      return;
    }

    setTouched({ fullName: true, phone: true });

    if (!senderValidation.isValid) {
      notify(t('smartPayment.invalid'));
      if (senderValidation.errors.fullName) {
        nameRef.current?.focus();
      } else {
        phoneRef.current?.focus();
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
      name: senderValidation.value.fullName,
      address: details.address.trim(),
      note: details.note.trim(),
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
          <div className={styles.brandHeader}>
            <span className={styles.logoFrame}>
              <img src={methodLogo} alt="" />
            </span>
            <div className={styles.brandText}>
              <span>{t('smartPayment.kicker')}</span>
              <h2 id="smart-payment-heading">{methodLabel}</h2>
            </div>
          </div>

          <p className={styles.body}>{t('smartPayment.body')}</p>

          <div className={styles.fields}>
            <div className={styles.fieldBlock}>
              <label className={styles.label} htmlFor="smart-payment-full-name">
                {t('smartPayment.fullName')}
              </label>
              <input
                ref={nameRef}
                id="smart-payment-full-name"
                className={`${styles.textInput} ${visibleErrors.fullName ? styles.invalidInput : ''}`}
                value={details.name}
                onChange={(event) => updateDetails({ name: event.target.value })}
                onBlur={() => setTouched((prev) => ({ ...prev, fullName: true }))}
                placeholder={t('smartPayment.fullNamePlaceholder')}
                autoComplete="name"
                enterKeyHint="next"
                aria-invalid={Boolean(visibleErrors.fullName)}
                aria-describedby={visibleErrors.fullName ? 'smart-payment-full-name-error' : undefined}
                required
              />
              {visibleErrors.fullName && (
                <p id="smart-payment-full-name-error" className={styles.errorText}>
                  {visibleErrors.fullName}
                </p>
              )}
            </div>

            <PhoneField
              label={t('smartPayment.phoneNumber')}
              hint={t('smartPayment.phoneHint')}
              error={visibleErrors.phone}
              value={phone}
              onChange={setPhone}
              onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
              inputRef={phoneRef}
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

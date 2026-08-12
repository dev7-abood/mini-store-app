import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOrder, PHONE_PREFIX } from '../context/OrderContext';
import { useCart } from '../context/CartContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { useTelegram } from '../hooks/useTelegram';
import { createMockManualPaymentOrder } from '../lib/manualPaymentMockService';
import { findPaymentMethod, isManualPaymentMethod } from '../lib/paymentMethods';
import { formatLocalPhone, isPalestinianMobileNumber, LOCAL_DIGITS } from '../lib/phone';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import Field from '../components/ui/Field';
import FlagPS from '../components/ui/FlagPS';
import PaymentMethodPicker from '../components/PaymentMethodPicker';
import { StoreStatusNotice } from '../components/StoreStatus';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './CheckoutScreen.module.css';

const MIN_SENDER_NAME_LENGTH = 3;
const MIN_ACCOUNT_IDENTIFIER_LENGTH = 5;

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

function SmartPaymentSenderFields({
  method,
  phone,
  error,
  onChange,
  onBlur,
  inputRef,
  t,
}) {
  const methodLabel = method?.labelKey ? t(method.labelKey) : t('payment.jawwalpay.label');
  const methodLogo = method?.logo || '/payments/jawwalpay.png';
  const descriptionId = error ? 'smart-payment-phone-error' : 'smart-payment-phone-hint';

  return (
    <section className={`${styles.senderCard} ${styles.smartSenderCard}`} aria-labelledby="smart-payment-sender-title">
      <div className={`${styles.senderHeader} ${styles.smartSenderHeader}`}>
        <span className={styles.smartLogoFrame}>
          <img src={methodLogo} alt="" />
        </span>
        <div>
          <span className={styles.senderBadge}>{t('smartPayment.kicker')}</span>
          <h2 id="smart-payment-sender-title">{methodLabel}</h2>
          <p>{t('smartPayment.checkoutBody')}</p>
        </div>
      </div>

      <div className={styles.senderFields}>
        <div className={styles.senderField}>
          <label htmlFor="smart-payment-phone">{t('smartPayment.phoneNumber')}</label>
          <div className={`${styles.phoneField} ${error ? styles.invalidPhoneField : ''}`}>
            <span className={styles.phonePrefix}>
              <FlagPS />
              {PHONE_PREFIX}
            </span>
            <input
              ref={inputRef}
              id="smart-payment-phone"
              value={phone}
              onChange={(event) => onChange(formatLocalPhone(event.target.value))}
              onBlur={onBlur}
              placeholder="598 304 517"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              enterKeyHint="done"
              maxLength={LOCAL_DIGITS + 2}
              dir="ltr"
              aria-invalid={Boolean(error)}
              aria-describedby={descriptionId}
              required
            />
          </div>
          {error ? (
            <p id="smart-payment-phone-error" className={styles.errorText}>
              {error}
            </p>
          ) : (
            <p id="smart-payment-phone-hint" className={styles.hintText}>
              {t('smartPayment.phoneHint')}
            </p>
          )}
        </div>
      </div>
    </section>
  );
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
  const phoneRef = useRef(null);
  const {
    details,
    updateDetails,
    phone,
    setPhone,
    fullPhone,
    fullDeliveryPhone,
    paymentMethod,
    setPaymentMethod,
    manualPaymentSender,
    updateManualPaymentSender,
    confirmOrder,
  } = useOrder();
  const { entries, total } = useCart();
  const {
    canCheckout,
    refresh: refreshStoreStatus,
  } = useStoreStatus();
  const { navigate } = useNavigation();
  const routeNavigate = useNavigate();
  const { notify } = useTelegram();
  const { place, isBusy } = useOrderFlow();
  const [isCheckingStore, setIsCheckingStore] = useState(false);
  const [smartTouched, setSmartTouched] = useState({ fullName: false, phone: false });
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const selectedMethod = findPaymentMethod(paymentMethod);
  const manualSelected = isManualPaymentMethod(paymentMethod);
  const smartSelected = selectedMethod?.type === 'smart';
  const manualSenderValidation = validateManualPaymentSender(manualPaymentSender, t);
  const smartPaymentValidation = validateSmartPaymentSender({ fullName: details.name, phone }, t);
  const showSmartNameError = smartSelected && (submitAttempted || smartTouched.fullName);
  const showSmartPhoneError = smartSelected && (submitAttempted || smartTouched.phone);
  const smartNameError = showSmartNameError ? smartPaymentValidation.errors.fullName : '';
  const smartPhoneError = showSmartPhoneError ? smartPaymentValidation.errors.phone : '';
  const submitting = isBusy || isCheckingStore;

  const submit = async () => {
    setSubmitAttempted(true);

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

    if (smartSelected) {
      if (!smartPaymentValidation.isValid) {
        notify(t('smartPayment.invalid'));
        if (smartPaymentValidation.errors.phone) phoneRef.current?.focus();
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
        name: smartPaymentValidation.value.fullName,
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
      return;
    }

    navigate(SCREENS.PHONE);
  };

  return (
    <Screen>
      <SubHeader title={t('checkout.title')} />
      <div className={styles.pad}>
        <Field
          label={smartSelected ? t('smartPayment.fullName') : t('checkout.nameLabel')}
          placeholder={smartSelected ? t('smartPayment.fullNamePlaceholder') : t('checkout.namePlaceholder')}
          value={details.name}
          onChange={(event) => updateDetails({ name: event.target.value })}
          onBlur={() => setSmartTouched((prev) => ({ ...prev, fullName: true }))}
          error={smartNameError}
          hint={smartSelected ? t('smartPayment.nameHint') : ''}
          autoComplete="name"
        />
        <Field
          multiline
          label={t('checkout.addressLabel')}
          placeholder={t('checkout.addressPlaceholder')}
          value={details.address}
          onChange={(event) => updateDetails({ address: event.target.value })}
        />
        <Field
          label={t('checkout.noteLabel')}
          placeholder={t('checkout.notePlaceholder')}
          value={details.note}
          onChange={(event) => updateDetails({ note: event.target.value })}
        />

        <div className={styles.paymentBlock}>
          <span className={styles.paymentLabel}>{t('payment.title')}</span>
          <PaymentMethodPicker
            value={paymentMethod}
            onChange={setPaymentMethod}
            renderSelectedAddon={(method) => {
              if (method.type === 'manual') {
                return (
                  <ManualPaymentSenderFields
                    value={manualPaymentSender}
                    errors={manualSenderValidation.errors}
                    onChange={updateManualPaymentSender}
                    t={t}
                  />
                );
              }

              if (method.type === 'smart') {
                return (
                  <SmartPaymentSenderFields
                    method={method}
                    phone={phone}
                    error={smartPhoneError}
                    onChange={setPhone}
                    onBlur={() => setSmartTouched((prev) => ({ ...prev, phone: true }))}
                    inputRef={phoneRef}
                    t={t}
                  />
                );
              }

              return null;
            }}
          />
        </div>
      </div>
      <StoreStatusNotice />
      <FixedCta>
        <Button
          variant="green"
          full
          onClick={submit}
          disabled={!canCheckout || submitting || (manualSelected && !manualSenderValidation.isValid)}
        >
          {submitting
            ? t('smartPayment.sending')
            : canCheckout
              ? t('checkout.continue')
              : t('storeStatus.closedCheckout')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

/*
|--------------------------------------------------------------------------
| Payment Details
|--------------------------------------------------------------------------
| Who is ordering, the phone the store reaches them on, and where it is
| delivered.
|
| One screen for every method: a smart payment and a manual one need the
| SAME three fields, so the only difference in the FORM is the sentence
| that sets the customer's expectation, and that comes from `isAutomatic`
| rather than from the method's name.
|
| What happens on "continue" DOES depend on the settlement, and that is
| the one place it may:
|
|   smart  -> POST /checkout now, then the OTP screen (unchanged)
|   manual -> the pay-from screen; no order is created until the customer
|             claims they paid, and no OTP is ever sent
|
| Nothing about the sender of a manual transfer is asked for here. The
| store matches a transfer by the order number the customer writes on it.
*/
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrder, PHONE_PREFIX } from '../context/OrderContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { usePaymentMethods } from '../context/PaymentMethodsContext';
import { useTelegram } from '../hooks/useTelegram';
import { formatLocalPhone, LOCAL_DIGITS } from '../lib/phone';
import { buildJawwalPayCheckoutPayload } from '../lib/jawwalPayCheckout';
import { paymentMethodLabel, paymentMethodSettlementLabel } from '../lib/paymentMethods';
import { validatePaymentDetails } from '../lib/paymentDetailsValidation';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import Field from '../components/ui/Field';
import FlagPS from '../components/ui/FlagPS';
import PaymentMethodHeader from '../components/payment/PaymentMethodHeader';
import { StoreStatusNotice } from '../components/StoreStatus';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './PaymentDetailsScreen.module.css';

function PhoneField({ label, hint, error, value, onChange, onBlur, inputRef }) {
  const descriptionId = error || hint ? 'payment-details-phone-description' : undefined;

  return (
    <div className={styles.fieldBlock}>
      <label className={styles.label} htmlFor="payment-details-phone">
        {label}
      </label>
      <div className={`${styles.phoneField} ${error ? styles.invalidField : ''}`}>
        <span className={styles.prefix}>
          <FlagPS />
          {PHONE_PREFIX}
        </span>
        <input
          ref={inputRef}
          id="payment-details-phone"
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

export default function PaymentDetailsScreen() {
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
    deliveryEdited,
    paymentMethod,
  } = useOrder();
  const { navigate } = useNavigation();
  const { notify } = useTelegram();
  const { place, isBusy } = useOrderFlow();
  const { findPaymentMethod } = usePaymentMethods();
  const { canCheckout, refresh: refreshStoreStatus } = useStoreStatus();
  const [isCheckingStore, setIsCheckingStore] = useState(false);
  const [touched, setTouched] = useState({ fullName: false, phone: false, address: false });

  const method = findPaymentMethod(paymentMethod);
  const methodLabel = paymentMethodLabel(method, t);
  /* The one thing that differs: a manual method is paid outside the app
     and confirmed by the store afterwards. */
  const isManual = Boolean(method) && !method.isAutomatic;
  const validation = validatePaymentDetails(
    { fullName: details.name, phone, address: details.address },
    t,
  );
  const visibleErrors = {
    fullName: touched.fullName ? validation.errors.fullName : '',
    phone: touched.phone ? validation.errors.phone : '',
    address: touched.address ? validation.errors.address : '',
  };

  const continueToPayment = async () => {
    if (!canCheckout) {
      notify(t('storeStatus.closedFallback'), 'warning');
      return;
    }

    setTouched({ fullName: true, phone: true, address: true });

    if (!validation.isValid) {
      notify(t('paymentDetails.invalid'), 'warning');
      if (validation.errors.fullName) {
        nameRef.current?.focus();
      } else if (validation.errors.phone) {
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
      notify(t('storeStatus.closedFallback'), 'warning');
      return;
    }

    /* A manual method pays FIRST and creates the order afterwards, so
       nothing is submitted here — the next screen shows the account to
       pay into and owns the claim that creates the order. */
    if (isManual) {
      navigate(SCREENS.MANUAL_PAYMENT);
      return;
    }

    const result = await place(buildJawwalPayCheckoutPayload({
      name: validation.value.fullName,
      address: validation.value.address,
      phone: fullPhone,
      deliveryPhone: deliveryEdited ? fullDeliveryPhone : null,
      paymentMethod,
      note: details.note,
    }));

    if (!result.ok) {
      const isStoreClosed = result.code === 'STORE_CLOSED';
      notify(
        isStoreClosed ? t('storeStatus.closedFallback') : result.message || t('paymentDetails.orderFailed'),
        isStoreClosed ? 'warning' : 'error',
      );
      return;
    }

    /* Smart only: the order exists unverified and the API has sent the
       code. The OTP screen comes next, exactly as it always has. */
    navigate(SCREENS.OTP);
  };

  return (
    <Screen>
      <SubHeader title={t('paymentDetails.title')} />
      <div className={styles.pad}>
        <section className={styles.paymentPanel} aria-labelledby="payment-details-heading">
          <PaymentMethodHeader
            method={method}
            label={methodLabel}
            kicker={paymentMethodSettlementLabel(method, t)}
            headingId="payment-details-heading"
            variant={isManual ? 'manual' : 'default'}
          />

          <p className={styles.body}>
            {t(isManual ? 'paymentDetails.peerBody' : 'paymentDetails.smartBody')}
          </p>

          <div className={styles.fields}>
            <Field
              inputRef={nameRef}
              label={t('paymentDetails.fullName')}
              placeholder={t('paymentDetails.fullNamePlaceholder')}
              value={details.name}
              onChange={(event) => updateDetails({ name: event.target.value })}
              onBlur={() => setTouched((prev) => ({ ...prev, fullName: true }))}
              autoComplete="name"
              enterKeyHint="next"
              error={visibleErrors.fullName}
              required
            />

            <PhoneField
              label={t('paymentDetails.phoneNumber')}
              hint={t(isManual ? 'paymentDetails.phoneHintPeer' : 'paymentDetails.phoneHintSmart')}
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
              label={t('paymentDetails.address')}
              placeholder={t('paymentDetails.addressPlaceholder')}
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
        <Button
          variant="green"
          full
          onClick={continueToPayment}
          disabled={isBusy || isCheckingStore || !canCheckout || !method}
        >
          {isBusy || isCheckingStore
            ? t('paymentDetails.sending')
            : canCheckout
              ? t('checkout.continue')
              : t('storeStatus.closedCheckout')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

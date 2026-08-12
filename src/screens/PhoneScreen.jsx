import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrder, PHONE_PREFIX } from '../context/OrderContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { useTelegram } from '../hooks/useTelegram';
import { formatLocalPhone, toLocalDigits, LOCAL_DIGITS } from '../lib/phone';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import CenterIllustration from '../components/ui/CenterIllustration';
import FlagPS from '../components/ui/FlagPS';
import { StoreStatusNotice } from '../components/StoreStatus';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './PhoneScreen.module.css';

const MIN_DIGITS = 8;

/** Merged +970 field: prefix on the right (RTL start), formatted digits. */
function PhoneField({ label, hint, value, onChange, inputRef, autoFocusRef }) {
  const inputId = useId();

  return (
    <div className={styles.fieldBlock}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.phoneField}>
        <span className={styles.prefix}>
          <FlagPS />
          {PHONE_PREFIX}
        </span>
        <input
          ref={inputRef ?? autoFocusRef}
          id={inputId}
          className={styles.input}
          placeholder="5555 555 555"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="done"
          maxLength={LOCAL_DIGITS + 2} /* 9 digits + 2 spaces */
          value={value}
          onChange={(e) => onChange(formatLocalPhone(e.target.value))}
        />
      </div>
      {hint && <p className={styles.hintText}>{hint}</p>}
    </div>
  );
}

/**
 * Phone entry screen: the main (OTP) phone plus a delivery contact phone.
 * The delivery field mirrors the main number live until the user edits
 * it, handled inside OrderContext.
 */
export default function PhoneScreen() {
  const { t } = useTranslation();
  const mainRef = useRef(null);
  const {
    phone, setPhone, deliveryPhone, setDeliveryPhone,
    details, fullPhone, fullDeliveryPhone, paymentMethod,
  } = useOrder();
  const { navigate } = useNavigation();
  const { notify } = useTelegram();
  const { place, isBusy } = useOrderFlow();
  const {
    canCheckout,
    refresh: refreshStoreStatus,
  } = useStoreStatus();
  const [isCheckingStore, setIsCheckingStore] = useState(false);

  /**
   * Places the order server-side (POST /checkout). The API converts the
   * cart into an unverified order and dispatches the OTP, so the code
   * is only ever sent for a real order.
   */
  const sendCode = async () => {
    if (!canCheckout) {
      notify(t('storeStatus.closedFallback'));
      return;
    }

    if (toLocalDigits(phone).length < MIN_DIGITS) {
      notify(t('phone.invalid'));
      mainRef.current?.focus();
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
      name: details.name.trim(),
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
          : result.message || t('phone.orderFailed'),
      );
      return;
    }

    navigate(SCREENS.OTP);
  };

  return (
    <Screen>
      <SubHeader title={t('phone.title')} />
      <CenterIllustration icon="📱" heading={t('phone.heading')}>
        {t('phone.body')}
      </CenterIllustration>
      <StoreStatusNotice />
      <div className={styles.pad}>
        <PhoneField
          label={t('phone.label')}
          value={phone}
          onChange={setPhone}
          inputRef={mainRef}
        />
        <PhoneField
          label={t('phone.deliveryLabel')}
          hint={t('phone.deliveryHint')}
          value={deliveryPhone}
          onChange={setDeliveryPhone}
        />
      </div>
      <FixedCta>
        <Button variant="green" full onClick={sendCode} disabled={isBusy || isCheckingStore || !canCheckout}>
          {isBusy || isCheckingStore
            ? t('phone.sending')
            : canCheckout
              ? t('phone.send')
              : t('storeStatus.closedCheckout')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

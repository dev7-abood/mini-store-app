import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrder, PHONE_PREFIX } from '../context/OrderContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import { formatLocalPhone, toLocalDigits, LOCAL_DIGITS } from '../lib/phone';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import CenterIllustration from '../components/ui/CenterIllustration';
import FlagPS from '../components/ui/FlagPS';
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
          placeholder="598 304 517"
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
 * it — handled inside OrderContext.
 */
export default function PhoneScreen() {
  const { t } = useTranslation();
  const mainRef = useRef(null);
  const { phone, setPhone, deliveryPhone, setDeliveryPhone } = useOrder();
  const { navigate } = useNavigation();
  const { notify } = useTelegram();

  const sendCode = () => {
    if (toLocalDigits(phone).length < MIN_DIGITS) {
      notify(t('phone.invalid'));
      mainRef.current?.focus();
      return;
    }
    /* Real flow: await sendOtp(fullPhone) from src/api/client.js first. */
    navigate(SCREENS.OTP);
  };

  return (
    <Screen>
      <SubHeader title={t('phone.title')} />
      <CenterIllustration icon="📱" heading={t('phone.heading')}>
        {t('phone.body')}
      </CenterIllustration>
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
        <Button variant="green" full onClick={sendCode}>
          {t('phone.send')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

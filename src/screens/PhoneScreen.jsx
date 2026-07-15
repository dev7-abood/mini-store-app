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

/**
 * Phone entry screen. The +970 prefix is merged into the field (on the
 * right — the RTL reading start), digits auto-format as "598 304 517",
 * and type="tel" + inputMode="tel" guarantee the numeric keypad on
 * mobile.
 */
export default function PhoneScreen() {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef(null);
  const { phone, setPhone } = useOrder();
  const { navigate } = useNavigation();
  const { notify } = useTelegram();

  const handleChange = (event) => {
    /* Store formatted; fullPhone in OrderContext strips non-digits. */
    setPhone(formatLocalPhone(event.target.value));
  };

  const sendCode = () => {
    const digits = toLocalDigits(phone);
    if (digits.length < MIN_DIGITS) {
      notify(t('phone.invalid'));
      inputRef.current?.focus();
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
        <label className={styles.label} htmlFor={inputId}>
          {t('phone.label')}
        </label>
        <div className={styles.phoneField}>
          <span className={styles.prefix}>
            <FlagPS />
            {PHONE_PREFIX}
          </span>
          <input
            ref={inputRef}
            id={inputId}
            className={styles.input}
            placeholder={t('phone.placeholder')}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            enterKeyHint="done"
            maxLength={LOCAL_DIGITS + 2} /* 9 digits + 2 spaces */
            value={phone}
            onChange={handleChange}
          />
        </div>
        <p className={styles.help}>{PHONE_PREFIX} {phone || t('phone.placeholder')}</p>
      </div>
      <FixedCta>
        <Button variant="green" full onClick={sendCode}>
          {t('phone.send')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

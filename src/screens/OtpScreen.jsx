import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOrder, PHONE_PREFIX } from '../context/OrderContext';
import { useCart } from '../context/CartContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { useTelegram } from '../hooks/useTelegram';
import { buildOrderMessage } from '../lib/orderMessage';
import {
  JAWWAL_PAY_OTP_LENGTH,
  isCompleteJawwalPayOtp,
  normalizeOtpDigits,
} from '../lib/jawwalPayCheckout';
import { sendOrderToChat } from '../api/telegramBot';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import CenterIllustration from '../components/ui/CenterIllustration';
import OtpInput from '../components/OtpInput';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './OtpScreen.module.css';

/*
|--------------------------------------------------------------------------
| OTP Verification
|--------------------------------------------------------------------------
| The order already exists (created by POST /checkout on the previous
| screen) and the API has dispatched the code. Here we:
|   1. POST /orders/{n}/verify with the entered code,
|   2. on success mirror the order to the Telegram chat,
|   3. start payment polling and show the success screen.
|
| A wrong code is an expected outcome, not an error state: the input
| shakes and the customer types again. Resend is throttled server-side
| (5/min), and a 429 is surfaced politely rather than as a failure.
*/
export default function OtpScreen() {
  const { t } = useTranslation();
  const { phone, fullPhone, fullDeliveryPhone, details, confirmOrder } = useOrder();
  const { entries, subtotal, deliveryFee, total, clearCart } = useCart();
  const { navigate } = useNavigation();
  const routeNavigate = useNavigate();
  const { haptic, notify, sendData } = useTelegram();
  const {
    orderNumber,
    verify: verifyCode,
    resend,
    jawwalPayOtpSession,
    confirmJawwalPayOtp,
    resendJawwalPayOtp,
    clearJawwalPayOtpSession,
    startPaymentPolling,
    isBusy,
  } = useOrderFlow();
  const [error, setError] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [message, setMessage] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const isJawwalPayOtp = Boolean(jawwalPayOtpSession);

  useEffect(() => {
    if (!jawwalPayOtpSession) return undefined;

    const tick = () => {
      setRemainingSeconds(
        Math.max(0, Math.ceil((jawwalPayOtpSession.expiresAt - Date.now()) / 1000)),
      );
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [jawwalPayOtpSession]);

  const submitOrder = useCallback(
    (orderNumber) => {
      /* 1) Raw payload for the Nutgram bot (web_app_data). */
      sendData({
        order: entries.map(({ product, qty }) => ({ id: product.id, qty })),
        name: details.name.trim(),
        address: details.address.trim(),
        note: details.note.trim(),
        phone: fullPhone,
        delivery_phone: fullDeliveryPhone,
        total,
      });

      /* 2) Human-readable order message to the chat via the Bot API.
         Fire-and-forget — a delivery failure never blocks the flow. */
      const message = buildOrderMessage({
        orderNumber,
        entries,
        subtotal,
        deliveryFee,
        total,
        details,
        phone: fullPhone,
        deliveryPhone: fullDeliveryPhone,
      });
      sendOrderToChat(message);
    },
    [sendData, entries, details, fullPhone, fullDeliveryPhone, subtotal, deliveryFee, total],
  );

  const verify = useCallback(
    async (code) => {
      const result = await verifyCode(code);

      if (!result.ok) {
        haptic('rigid');
        setError(true);
        if (result.throttled) notify(t('otp.throttled'));
        return;
      }

      haptic('heavy');
      /* Keep the local order number in sync for the status screen. */
      confirmOrder(orderNumber);
      submitOrder(orderNumber);
      /* Payment (if any) is approved in the wallet app — start watching. */
      startPaymentPolling(orderNumber);
      navigate(SCREENS.SUCCESS);
    },
    [verifyCode, haptic, notify, t, confirmOrder, orderNumber, submitOrder, startPaymentPolling, navigate],
  );

  const confirmJawwalPay = useCallback(async () => {
    if (!jawwalPayOtpSession || isBusy) return;

    const code = normalizeOtpDigits(otpCode);
    if (!isCompleteJawwalPayOtp(code)) {
      setMessage(t('otp.incomplete'));
      setError(true);
      return;
    }

    setMessage('');
    const result = await confirmJawwalPayOtp(code);

    if (!result.ok) {
      haptic('rigid');
      const outcome = result.outcome;
      const nextMessage = result.message
        || (outcome?.network ? t('otp.networkError') : t('otp.invalid'));

      if (outcome?.expiredSession || result.missingSession) {
        clearJawwalPayOtpSession();
        notify(nextMessage || t('otp.sessionExpired'));
        navigate(SCREENS.SMART_PAYMENT);
        return;
      }

      setMessage(nextMessage);
      if (outcome?.clearOtp !== false && !outcome?.network) {
        setError(true);
      }
      return;
    }

    if (!result.checkoutCompleted) {
      setMessage(result.message || t('otp.paymentIncomplete'));
      return;
    }

    haptic('heavy');
    setOtpCode('');
    clearJawwalPayOtpSession();
    clearCart();

    const confirmedOrderNumber = result.order?.orderNumber || result.order?.id || null;
    if (confirmedOrderNumber) confirmOrder(String(confirmedOrderNumber));

    if (result.redirectUrl) {
      if (/^https?:\/\//i.test(result.redirectUrl)) {
        window.location.assign(result.redirectUrl);
      } else {
        routeNavigate(result.redirectUrl, { replace: true });
      }
      return;
    }

    if (confirmedOrderNumber) {
      routeNavigate(`/orders/${encodeURIComponent(confirmedOrderNumber)}`, { replace: true });
      return;
    }

    navigate(SCREENS.SUCCESS);
  }, [
    jawwalPayOtpSession,
    isBusy,
    otpCode,
    t,
    confirmJawwalPayOtp,
    haptic,
    clearJawwalPayOtpSession,
    clearCart,
    confirmOrder,
    routeNavigate,
    navigate,
    notify,
  ]);

  const resendJawwalPay = useCallback(async () => {
    if (remainingSeconds > 0 || isBusy) return;

    haptic();
    setMessage('');
    const result = await resendJawwalPayOtp();
    if (result.ok && result.jawwalPayOtpRequired) {
      setOtpCode('');
      notify(t('otp.resent'));
      return;
    }

    notify(result.message || t('otp.resendFailed'));
  }, [remainingSeconds, isBusy, haptic, resendJawwalPayOtp, notify, t]);

  const resendPhoneOtp = useCallback(async () => {
    haptic();
    const result = await resend();
    notify(
      result.throttled
        ? t('otp.throttled')
        : result.ok
          ? t('otp.resent')
          : t('otp.resendFailed'),
    );
  }, [haptic, resend, notify, t]);

  const formatCountdown = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  };

  return (
    <Screen>
      <SubHeader title={t('otp.title')} />
      <CenterIllustration icon="🔐" heading={t(isJawwalPayOtp ? 'otp.jawwalHeading' : 'otp.heading')}>
        {t(isJawwalPayOtp ? 'otp.jawwalBody' : 'otp.body')}{' '}
        <b className={styles.phone}>
          {isJawwalPayOtp ? jawwalPayOtpSession.notifiedPhone : `${PHONE_PREFIX} ${phone}`}
        </b>
      </CenterIllustration>
      {message && (
        <p className={styles.errorText} role="alert">
          {message}
        </p>
      )}
      <OtpInput
        onComplete={isJawwalPayOtp ? undefined : verify}
        onChangeCode={isJawwalPayOtp ? setOtpCode : undefined}
        autoSubmit={!isJawwalPayOtp}
        length={JAWWAL_PAY_OTP_LENGTH}
        disabled={isBusy}
        error={error}
        onErrorHandled={() => setError(false)}
        getDigitLabel={(index) => t('otp.digitLabel', { index: index + 1 })}
      />
      <button
        type="button"
        className={styles.resend}
        disabled={isBusy || (isJawwalPayOtp && remainingSeconds > 0)}
        onClick={isJawwalPayOtp ? resendJawwalPay : resendPhoneOtp}
      >
        {isJawwalPayOtp && remainingSeconds > 0
          ? t('otp.resendIn', { time: formatCountdown(remainingSeconds) })
          : t('otp.resend')}
      </button>
      <p className={styles.hint}>{t(isJawwalPayOtp ? 'otp.jawwalHint' : 'otp.hint')}</p>
      {isJawwalPayOtp && (
        <FixedCta>
          <Button
            variant="green"
            full
            onClick={confirmJawwalPay}
            disabled={isBusy || !isCompleteJawwalPayOtp(otpCode)}
          >
            {isBusy ? t('otp.confirming') : t('otp.confirm')}
          </Button>
        </FixedCta>
      )}
    </Screen>
  );
}

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrder, PHONE_PREFIX } from '../context/OrderContext';
import { useCart } from '../context/CartContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { useTelegram } from '../hooks/useTelegram';
import { buildOrderMessage } from '../lib/orderMessage';
import { sendOrderToChat } from '../api/telegramBot';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import CenterIllustration from '../components/ui/CenterIllustration';
import OtpInput from '../components/OtpInput';
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
  const { entries, subtotal, deliveryFee, total } = useCart();
  const { navigate } = useNavigation();
  const { haptic, notify, sendData } = useTelegram();
  const {
    orderNumber,
    verify: verifyCode,
    resend,
    startPaymentPolling,
    isBusy,
  } = useOrderFlow();
  const [error, setError] = useState(false);

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

  return (
    <Screen>
      <SubHeader title={t('otp.title')} />
      <CenterIllustration icon="🔐" heading={t('otp.heading')}>
        {t('otp.body')} <b className={styles.phone}>{`${PHONE_PREFIX} ${phone}`}</b>
      </CenterIllustration>
      <OtpInput onComplete={verify} error={error} onErrorHandled={() => setError(false)} />
      <button
        type="button"
        className={styles.resend}
        disabled={isBusy}
        onClick={async () => {
          haptic();
          const result = await resend();
          notify(
            result.throttled
              ? t('otp.throttled')
              : result.ok
                ? t('otp.resent')
                : t('otp.resendFailed'),
          );
        }}
      >
        {t('otp.resend')}
      </button>
      <p className={styles.hint}>{t('otp.hint')}</p>
    </Screen>
  );
}

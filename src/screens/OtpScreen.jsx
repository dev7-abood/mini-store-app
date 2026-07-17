import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrder, PHONE_PREFIX } from '../context/OrderContext';
import { useCart } from '../context/CartContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import { buildOrderMessage } from '../lib/orderMessage';
import { sendOrderToChat } from '../api/telegramBot';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import CenterIllustration from '../components/ui/CenterIllustration';
import OtpInput from '../components/OtpInput';
import styles from './OtpScreen.module.css';

/** Demo verification code — replace with verifyOtp() from the API layer. */
const DEMO_CODE = '000000';

/**
 * OTP verification. On success it:
 *  1. generates the order number,
 *  2. sends the payload to the bot via tg.sendData()
 *     (received by Nutgram's onWebAppData — keyboard-button launches),
 *  3. sends the formatted order details to the Telegram chat through
 *     our server route /api/telegram/order (token stays server-side),
 *  4. shows the success screen.
 */
export default function OtpScreen() {
  const { t } = useTranslation();
  const { phone, fullPhone, fullDeliveryPhone, details, confirmOrder } = useOrder();
  const { entries, subtotal, deliveryFee, total } = useCart();
  const { navigate } = useNavigation();
  const { haptic, notify, sendData } = useTelegram();
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
    (code) => {
      if (code === DEMO_CODE) {
        haptic('heavy');
        const orderNumber = confirmOrder();
        submitOrder(orderNumber);
        navigate(SCREENS.SUCCESS);
      } else {
        haptic('rigid');
        setError(true);
      }
    },
    [haptic, confirmOrder, submitOrder, navigate],
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
        onClick={() => {
          haptic();
          notify(t('otp.resent'));
        }}
      >
        {t('otp.resend')}
      </button>
      <p className={styles.hint}>{t('otp.hint')}</p>
    </Screen>
  );
}

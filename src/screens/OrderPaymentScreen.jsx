/*
|--------------------------------------------------------------------------
| Order Payment
|--------------------------------------------------------------------------
| Where a manual order lands the moment the customer claims they paid,
| and where they come back to check on it.
|
| The claim created the order — it did NOT pay for it. So this screen
| opens in the awaiting-verification state and says the store is
| checking. It never shows success, and there is no "payment successful"
| screen on this path at all: `is_paid` is false until a cashier says
| otherwise, and `POST /checkout` returning 201 says only that the order
| exists.
|
| Three things it deliberately does not do:
|
|   • No countdown. `expires_in` is null for a manual payment — it does
|     not expire, and there is nothing to count down to.
|   • No polling timer. `should_poll` is false and stays false; a cashier
|     resolves this, sometimes hours later. It refreshes when the app
|     comes back to the foreground, and on demand.
|   • No way to verify a payment. There is no customer-facing endpoint
|     for that and there never will be. The reminder button notifies the
|     store and moves nothing.
*/
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrderFlow } from '../context/OrderFlowContext';
import { useOrder } from '../context/OrderContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useToasts } from '../context/ToastContext';
import { useTelegram } from '../hooks/useTelegram';
import { useAppResume } from '../hooks/useAppResume';
import { useFixedCtaSpace } from '../hooks/useFixedCtaSpace';
import { settlementText } from '../lib/payment';
import { normalizeOrderNumber } from '../lib/orderStatus';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import PaymentInstructions from '../components/payment/PaymentInstructions';
import PaymentStatusPanel from '../components/payment/PaymentStatusPanel';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './OrderPaymentScreen.module.css';

/**
 * Holds open as much room as the fixed CTA occupies, so the last card can
 * always be scrolled clear of the buttons. `height` is the measured bar;
 * until it is measured the CSS fallback applies.
 *
 * @param {{height: number}} props
 */
function CtaSpacer({ height }) {
  return (
    <div
      className={styles.ctaSpacer}
      style={height ? { height } : undefined}
      aria-hidden="true"
    />
  );
}

export default function OrderPaymentScreen() {
  const { t, i18n } = useTranslation();
  const { orderNumber: routeOrderNumber } = useParams();
  const routeNavigate = useNavigate();
  const { navigate: flowNavigate } = useNavigation();
  const { resetOrder } = useOrder();
  const { confirmToast } = useToasts();
  const { notify, haptic } = useTelegram();
  const {
    order,
    payment,
    loadOrder,
    refreshPayment,
    remindStore,
    cancel,
    reset: resetOrderFlow,
    isBusy,
  } = useOrderFlow();
  const [loadState, setLoadState] = useState(payment ? 'ready' : 'loading');
  /* The bar is one, two or three buttons depending on the payment's state
     and whether the order is still cancellable, so the room to leave for
     it is measured rather than assumed. */
  const [ctaRef, ctaHeight] = useFixedCtaSpace();

  const orderNumber = normalizeOrderNumber(routeOrderNumber);

  /* Always re-read from the API rather than trusting what the claim
     returned: a cashier may already have decided. */
  const load = useCallback(async () => {
    if (!orderNumber) {
      setLoadState('invalid');
      return;
    }

    const [next] = await Promise.all([
      refreshPayment(orderNumber),
      /* The order too, for its cancellable state. */
      loadOrder(orderNumber, { silent: true }),
    ]);
    setLoadState(next ? 'ready' : 'error');
  }, [orderNumber, refreshPayment, loadOrder]);

  useEffect(() => {
    load();
  }, [load]);

  /* The customer leaves for their banking app, or closes and reopens the
     order — those are the moments worth re-reading, not a timer. */
  useAppResume(load);

  const formatDate = useCallback(
    (iso) => {
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) return null;
      return new Intl.DateTimeFormat(i18n.language || 'ar', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(parsed);
    },
    [i18n.language],
  );

  /* Notifies the store and nothing else, so it stays on this screen and
     only the cooldown changes. */
  const remind = useCallback(() => remindStore(orderNumber), [remindStore, orderNumber]);

  const openOrder = () => {
    if (!orderNumber) return;
    routeNavigate(`/orders/${encodeURIComponent(orderNumber)}`, { replace: true });
  };

  const orderAgain = () => {
    resetOrderFlow();
    resetOrder();
    flowNavigate(SCREENS.MENU);
    routeNavigate('/', { replace: true });
  };

  /* A rejection refuses the money, not the order: it stays cancellable. */
  const cancelOrder = async () => {
    const shouldCancel = await confirmToast(t('status.cancelConfirm'), {
      key: 'cancel-order-payment',
      type: 'warning',
      title: t('status.cancel'),
      confirmLabel: t('status.cancel'),
      cancelLabel: t('status.keepOrder'),
    });
    if (!shouldCancel) return;

    haptic('rigid');
    const ok = await cancel();
    notify(ok ? t('status.cancelled') : t('status.cancelFailed'), ok ? 'success' : 'error');
    if (ok) openOrder();
  };

  if (loadState === 'loading') {
    return (
      <Screen>
        <SubHeader title={t('orderPayment.title')} showBack={false} />
        <main className={styles.content} aria-busy="true">
          <div className={styles.skeleton} aria-hidden="true" />
          <div className={styles.skeleton} aria-hidden="true" />
        </main>
      </Screen>
    );
  }

  if (!payment) {
    return (
      <Screen>
        <SubHeader title={t('orderPayment.title')} showBack={false} />
        <main className={styles.content}>
          <section className={styles.hero}>
            <h2>{t('orderPayment.unavailableTitle')}</h2>
            <p>{t('orderPayment.unavailableBody')}</p>
          </section>
          <CtaSpacer height={ctaHeight} />
        </main>
        <FixedCta elementRef={ctaRef}>
          <Button full onClick={openOrder} disabled={!orderNumber}>
            {t('orderPayment.openOrder')}
          </Button>
        </FixedCta>
      </Screen>
    );
  }

  const { instructions } = payment;
  const isRejected = payment.claim?.isRejected || payment.rejection?.rejected;
  const isCancellable = Boolean(order?.isCancellable);

  return (
    <Screen>
      <SubHeader
        title={t('orderPayment.title')}
        showBack={false}
        trailing={orderNumber && <span className={styles.chip}>{orderNumber}</span>}
      />

      <main className={styles.content}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>
            {settlementText(t, payment.settlement, payment.settlementLabel)}
          </span>
          <h2>
            {t(
              payment.isPaid
                ? 'orderPayment.paidHeading'
                : isRejected
                  ? 'orderPayment.rejectedHeading'
                  : 'orderPayment.awaitingHeading',
            )}
          </h2>
          <p>
            {t(
              payment.isPaid
                ? 'orderPayment.paidBody'
                : isRejected
                  ? 'orderPayment.rejectedBody'
                  : 'orderPayment.awaitingBody',
            )}
          </p>
        </section>

        {/* The panel owns the status, the rejection reason, the "confirmed
            by" receipt and the reminder. The instructions render in full
            below it, so they are not hidden behind a disclosure here. */}
        <PaymentStatusPanel
          payment={payment}
          formatDate={formatDate}
          onRemind={remind}
          showInstructions={false}
        />

        {instructions && (
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>
              {t(payment.isPaid ? 'orderPayment.receiptTitle' : 'orderPayment.detailsTitle')}
            </h3>
            {/* `reference` is the real order number now — the only thing
                tying the customer's transfer to this order. */}
            <PaymentInstructions instructions={instructions} />
          </section>
        )}

        <CtaSpacer height={ctaHeight} />
      </main>

      <FixedCta elementRef={ctaRef}>
        <div className={styles.actions}>
          <Button variant="green" full onClick={openOrder}>
            {t('orderPayment.trackOrder')}
          </Button>
          {isCancellable && (
            <Button
              full
              className={styles.cancelButton}
              disabled={isBusy}
              onClick={cancelOrder}
            >
              {t('status.cancel')}
            </Button>
          )}
          {payment.isPaid && (
            <Button full className={styles.secondary} onClick={orderAgain}>
              {t('status.orderAgain')}
            </Button>
          )}
        </div>
      </FixedCta>
    </Screen>
  );
}

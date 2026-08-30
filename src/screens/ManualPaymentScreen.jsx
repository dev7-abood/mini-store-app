/*
|--------------------------------------------------------------------------
| Manual Payment — pay, then claim
|--------------------------------------------------------------------------
| The screen the customer actually pays from, and the only one in the app
| that exists BEFORE its order does. The manual flow runs in the opposite
| order to every other method: the customer transfers the money first,
| and the order is created afterwards by their claim.
|
|   GET /manual-payment/{method}   the account, the amount        (here)
|   customer pays outside the app
|   POST /checkout                 "I have paid" — creates the order
|
| `instructions.reference` is NULL here: there is no order number yet, so
| the screen says the reference will appear once they confirm rather than
| showing an empty row.
|
| The button is a CLAIM, never a completion. It cannot say "Pay now" or
| "Complete payment" — the payment already happened outside the app, and
| only the store can decide whether it arrived.
*/
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrder } from '../context/OrderContext';
import { useCart } from '../context/CartContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { usePaymentMethods } from '../context/PaymentMethodsContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import { buildJawwalPayCheckoutPayload } from '../lib/jawwalPayCheckout';
import { paymentMethodLabel, paymentMethodSettlementLabel } from '../lib/paymentMethods';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import PaymentMethodHeader from '../components/payment/PaymentMethodHeader';
import PaymentInstructions from '../components/payment/PaymentInstructions';
import { StoreStatusNotice } from '../components/StoreStatus';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './ManualPaymentScreen.module.css';

export default function ManualPaymentScreen() {
  const { t } = useTranslation();
  const routeNavigate = useNavigate();
  const { goBack } = useNavigation();
  const {
    details,
    fullPhone,
    fullDeliveryPhone,
    deliveryEdited,
    paymentMethod,
    confirmOrder,
  } = useOrder();
  const { clearCart } = useCart();
  const { place, loadManualPaymentDetails, isBusy } = useOrderFlow();
  const { findPaymentMethod } = usePaymentMethods();
  const { canCheckout, refresh: refreshStoreStatus } = useStoreStatus();
  const { notify } = useTelegram();
  const [state, setState] = useState({ status: 'loading', details: null, message: null });
  const [isClaiming, setIsClaiming] = useState(false);

  const method = findPaymentMethod(paymentMethod);

  const load = useCallback(async () => {
    if (!paymentMethod) return;

    setState({ status: 'loading', details: null, message: null });
    const result = await loadManualPaymentDetails(paymentMethod);
    setState(
      result.ok
        ? { status: 'ready', details: result.details, message: null }
        : { status: 'error', details: null, message: result.message },
    );
  }, [paymentMethod, loadManualPaymentDetails]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   | "I have paid" — a statement, not a payment.
   |
   | It creates the order and tells the store. A 201 back means the order
   | exists, NOT that the money arrived: `is_paid` is false and stays
   | false until a cashier verifies it. So this lands on the order's
   | payment screen in its awaiting-verification state, and never on a
   | success screen.
   */
  const claimPaid = async () => {
    if (isClaiming || !canCheckout) {
      if (!canCheckout) notify(t('storeStatus.closedFallback'), 'warning');
      return;
    }

    setIsClaiming(true);
    const latestStatus = await refreshStoreStatus();
    if (latestStatus && latestStatus.canCheckout === false) {
      setIsClaiming(false);
      notify(t('storeStatus.closedFallback'), 'warning');
      return;
    }

    const result = await place(buildJawwalPayCheckoutPayload({
      address: details.address.trim(),
      phone: fullPhone,
      deliveryPhone: deliveryEdited ? fullDeliveryPhone : null,
      paymentMethod,
      note: details.note,
    }));
    setIsClaiming(false);

    if (!result.ok) {
      const isStoreClosed = result.code === 'STORE_CLOSED';
      notify(
        isStoreClosed
          ? t('storeStatus.closedFallback')
          : result.message || t('paymentDetails.orderFailed'),
        isStoreClosed ? 'warning' : 'error',
      );
      return;
    }

    const orderNumber = result.order?.orderNumber;
    if (!orderNumber) {
      notify(t('paymentDetails.orderFailed'), 'error');
      return;
    }

    confirmOrder(orderNumber);
    clearCart();
    routeNavigate(`/orders/${encodeURIComponent(orderNumber)}/payment`, { replace: true });
  };

  const instructions = state.details?.instructions ?? null;
  const methodLabel = paymentMethodLabel(method, t);

  return (
    <Screen>
      <SubHeader title={t('manualPayment.title')} />

      <div className={styles.pad}>
        <section className={styles.panel} aria-labelledby="manual-payment-heading">
          <PaymentMethodHeader
            method={method}
            label={methodLabel}
            kicker={paymentMethodSettlementLabel(method, t)}
            headingId="manual-payment-heading"
            variant="manual"
          />
          <p className={styles.body}>{t('manualPayment.body')}</p>
        </section>

        {state.status === 'loading' && (
          <div className={styles.skeleton} aria-busy="true" aria-hidden="true" />
        )}

        {state.status === 'error' && (
          <section className={styles.errorCard} role="alert">
            <p>{state.message || t('manualPayment.loadFailed')}</p>
            <Button full onClick={load} disabled={isBusy}>
              {t('status.refresh')}
            </Button>
          </section>
        )}

        {instructions && (
          <>
            <section className={styles.panel}>
              <PaymentInstructions instructions={instructions} />
            </section>

            {/* There is no order number yet, so there is no reference to
                show — say when it will appear instead of an empty row. */}
            <p className={styles.referencePending}>{t('manualPayment.referencePending')}</p>

            <section className={styles.confirmCard}>
              <h3>{t('manualPayment.confirmTitle')}</h3>
              <p>{t('manualPayment.confirmBody')}</p>
            </section>
          </>
        )}
      </div>

      <StoreStatusNotice />

      <FixedCta>
        <div className={styles.actions}>
          <Button
            variant="green"
            full
            onClick={claimPaid}
            disabled={!instructions || isClaiming || isBusy || !canCheckout}
          >
            {isClaiming
              ? t('manualPayment.claiming')
              : canCheckout
                ? t('manualPayment.claimPaid')
                : t('storeStatus.closedCheckout')}
          </Button>
          <Button full className={styles.backButton} onClick={goBack} disabled={isClaiming}>
            {t('manualPayment.notYet')}
          </Button>
        </div>
      </FixedCta>
    </Screen>
  );
}

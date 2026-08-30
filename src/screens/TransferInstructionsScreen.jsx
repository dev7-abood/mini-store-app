/*
|--------------------------------------------------------------------------
| Transfer / Cash Instructions
|--------------------------------------------------------------------------
| Shown once the phone is verified and the payment request has been
| pushed — the moment the store is notified. It is the entire transfer
| screen: how much, what reference to write on it, and the account.
|
| Reached whenever `payment.instructions` is non-null. That is the test,
| never the method's name.
|
| Two things this screen deliberately does NOT do:
|
|   • No countdown. `expires_in` is null for a manual payment — it does
|     not expire, and there is nothing to count down to.
|   • No polling timer. `should_poll` is false and stays false; a cashier
|     resolves this, sometimes hours later. It refreshes when the app
|     comes back to the foreground, and that is all.
|
| "I've sent it" calls NOTHING. There is no customer-facing endpoint to
| confirm a payment and there never will be — the customer cannot mark
| their own money as received. The button just returns them to the order.
*/
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrderFlow } from '../context/OrderFlowContext';
import { paymentStatusText, settlementText } from '../lib/payment';
import { normalizeOrderNumber } from '../lib/orderStatus';
import { useAppResume } from '../hooks/useAppResume';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import PaymentInstructions from '../components/payment/PaymentInstructions';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './TransferInstructionsScreen.module.css';

export default function TransferInstructionsScreen() {
  const { t } = useTranslation();
  const { orderNumber: routeOrderNumber } = useParams();
  const routeNavigate = useNavigate();
  const { payment, refreshPayment } = useOrderFlow();
  const [loadState, setLoadState] = useState(payment?.instructions ? 'ready' : 'loading');

  const orderNumber = normalizeOrderNumber(routeOrderNumber);

  /* Always re-read from the API: the instructions are rebuilt from a
     snapshot the backend froze when the request was pushed, and are
     never cached locally past the session. */
  const load = useCallback(async () => {
    if (!orderNumber) {
      setLoadState('invalid');
      return;
    }

    const next = await refreshPayment(orderNumber);
    setLoadState(next ? 'ready' : 'error');
  }, [orderNumber, refreshPayment]);

  useEffect(() => {
    load();
  }, [load]);

  /* The customer leaves for their banking app and comes back — that is
     the moment worth re-reading, not a timer. */
  useAppResume(load);

  const openOrder = () => {
    if (!orderNumber) return;
    routeNavigate(`/orders/${encodeURIComponent(orderNumber)}`, { replace: true });
  };

  const instructions = payment?.instructions ?? null;

  if (loadState === 'loading') {
    return (
      <Screen>
        <SubHeader title={t('transfer.title')} showBack={false} />
        <main className={styles.content} aria-busy="true">
          <div className={styles.skeleton} aria-hidden="true" />
          <div className={styles.skeleton} aria-hidden="true" />
        </main>
      </Screen>
    );
  }

  if (!instructions) {
    return (
      <Screen>
        <SubHeader title={t('transfer.title')} showBack={false} />
        <main className={styles.content}>
          <section className={styles.hero}>
            <h2>{t('transfer.unavailableTitle')}</h2>
            <p>{t('transfer.unavailableBody')}</p>
          </section>
        </main>
        <FixedCta>
          <Button full onClick={openOrder} disabled={!orderNumber}>
            {t('transfer.openOrder')}
          </Button>
        </FixedCta>
      </Screen>
    );
  }

  return (
    <Screen>
      <SubHeader
        title={t('transfer.title')}
        showBack={false}
        trailing={<span className={styles.statusPill}>{paymentStatusText(t, payment)}</span>}
      />

      <main className={styles.content}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>
            {settlementText(t, instructions.settlement, payment.settlementLabel)}
          </span>
          <h2>{t('transfer.heading')}</h2>
          <p>{t('transfer.body')}</p>
        </section>

        <section className={styles.panel}>
          <PaymentInstructions instructions={instructions} />
        </section>

        <section className={styles.panel}>
          <h3 className={styles.stepsTitle}>{t('transfer.stepsTitle')}</h3>
          <ol className={styles.steps}>
            {['open', 'amount', 'account', 'reference', 'wait'].map((step) => (
              <li key={step}>{t(`transfer.steps.${step}`)}</li>
            ))}
          </ol>
        </section>
      </main>

      <FixedCta>
        {/* Acknowledgement only — it sends nothing. */}
        <Button variant="green" full onClick={openOrder}>
          {t('transfer.acknowledge')}
        </Button>
      </FixedCta>
    </Screen>
  );
}

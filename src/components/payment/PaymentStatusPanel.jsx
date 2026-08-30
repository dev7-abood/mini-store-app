/*
|--------------------------------------------------------------------------
| Payment Status Panel
|--------------------------------------------------------------------------
| Everything the app says about a payment, driven by the booleans the API
| sends and never by the method's name:
|
|   awaitingConfirmation  -> the store has been told; a cashier is next
|   isPaid                -> paid; if a PERSON verified it, say who and when
|   claim.isRejected      -> the store could not find the money
|   isRetryable           -> a smart attempt failed and may be repeated
|
| The claim is never rendered as a payment. Between the customer pressing
| "I have paid" and a cashier agreeing, this panel says the store is
| checking — never paid, confirmed, successful or done.
|
| A manual payment shows no countdown (`expiresIn` is null for one) and
| starts no timer. Its instructions stay reachable throughout — while it
| waits, so the customer can check what they paid against, and after it
| is settled either way, as the receipt.
*/
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmationSourceText, paymentStatusText } from '../../lib/payment';
import PaymentInstructions from './PaymentInstructions';
import PaymentReminderButton from './PaymentReminderButton';
import Button from '../ui/Button';
import styles from './PaymentStatusPanel.module.css';

function classNames(...names) {
  return names.filter(Boolean).join(' ');
}

/**
 * @param {{payment: object|null, formatDate: (iso: string) => string|null,
 *   onRetry?: () => void, isRetrying?: boolean,
 *   onRemind?: () => Promise<object>, showInstructions?: boolean}} props
 */
export default function PaymentStatusPanel({
  payment,
  formatDate,
  onRetry = null,
  isRetrying = false,
  onRemind = null,
  showInstructions = true,
}) {
  const { t } = useTranslation();
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  if (!payment) return null;

  const { claim, confirmation, rejection, reminder, instructions } = payment;
  const awaiting = payment.awaitingConfirmation;
  const rejected = claim?.isRejected || rejection?.rejected;
  /* A person verified it — this line is the customer's receipt that
     someone at the store acknowledged their money. */
  const manuallyConfirmed = payment.isPaid && confirmation?.isManual;
  const confirmedAt = confirmation?.confirmedAt ? formatDate(confirmation.confirmedAt) : null;
  const rejectedAt = rejection?.rejectedAt ? formatDate(rejection.rejectedAt) : null;
  /* Smart attempts only. A rejected claim is deliberately NOT retryable:
     a mistaken rejection is fixed by the cashier approving, never by the
     customer claiming again. */
  const canRetry =
    Boolean(onRetry) && payment.isRetryable && (payment.attemptsRemaining ?? 0) > 0;

  const tone = payment.isPaid
    ? styles.paid
    : rejected
      ? styles.rejected
      : awaiting
        ? styles.awaiting
        : payment.isRetryable
          ? styles.failed
          : '';

  return (
    <section className={classNames(styles.panel, tone)} aria-live="polite">
      <div className={styles.head}>
        <span className={styles.mark} aria-hidden="true">
          {payment.isPaid ? '✓' : rejected || payment.isRetryable ? '!' : '⏳'}
        </span>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>{t('payment.panelTitle')}</span>
          <b>{paymentStatusText(t, payment)}</b>
        </div>
      </div>

      {awaiting && <p className={styles.body}>{t('payment.awaiting.body')}</p>}

      {/* The store looked and could not find the money. The ORDER is not
          cancelled by this — only the payment was refused. */}
      {rejected && (
        <div className={styles.rejection}>
          <span className={styles.rejectionTitle}>{t('payment.rejected.title')}</span>
          {rejection?.reason && <p className={styles.rejectionReason}>{rejection.reason}</p>}
          {rejection?.rejectedBy && (
            <p className={styles.rejectionMeta}>
              {rejectedAt
                ? t('payment.rejected.byAt', { name: rejection.rejectedBy, at: rejectedAt })
                : t('payment.rejected.by', { name: rejection.rejectedBy })}
            </p>
          )}
          <p className={styles.rejectionHelp}>{t('payment.rejected.help')}</p>
        </div>
      )}

      {manuallyConfirmed && (
        <div className={styles.confirmation}>
          <span className={styles.confirmationSource}>
            {confirmationSourceText(t, confirmation)}
          </span>
          {confirmation.confirmedBy && (
            <b>
              {confirmedAt
                ? t('payment.confirmedByAt', { name: confirmation.confirmedBy, at: confirmedAt })
                : t('payment.confirmedBy', { name: confirmation.confirmedBy })}
            </b>
          )}
          {/* Free text the cashier typed, e.g. a till receipt number. */}
          {confirmation.note && <p className={styles.confirmationNote}>{confirmation.note}</p>}
        </div>
      )}

      {/* A smart failure reason. A rejection's reason is rendered above. */}
      {payment.failureReason && !rejected && (
        <p className={styles.failure}>{payment.failureReason}</p>
      )}

      {showInstructions && instructions && (
        <>
          <button
            type="button"
            className={styles.disclosure}
            aria-expanded={instructionsOpen}
            onClick={() => setInstructionsOpen((open) => !open)}
          >
            {t(
              payment.isPaid
                ? 'payment.instructions.viewReceipt'
                : 'payment.instructions.viewDetails',
            )}
            <span aria-hidden="true">{instructionsOpen ? '−' : '+'}</span>
          </button>
          {instructionsOpen && (
            <PaymentInstructions instructions={instructions} className={styles.instructions} />
          )}
        </>
      )}

      {/* The nudge exists only while a person still has to decide. */}
      {awaiting && onRemind && (
        <PaymentReminderButton reminder={reminder} onRemind={onRemind} />
      )}

      {canRetry && (
        <div className={styles.retry}>
          <Button full disabled={isRetrying} onClick={onRetry}>
            {isRetrying ? t('payment.retrying') : t('payment.retry')}
          </Button>
          <p className={styles.attempts}>
            {t('payment.attemptsRemaining', { count: payment.attemptsRemaining })}
          </p>
        </div>
      )}
    </section>
  );
}

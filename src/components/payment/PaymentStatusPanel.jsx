/*
|--------------------------------------------------------------------------
| Payment Status Panel
|--------------------------------------------------------------------------
| Everything the order screen says about the payment, driven by the three
| booleans the API sends and never by the method's name:
|
|   awaitingConfirmation  -> the store has been told, a cashier is next
|   isPaid                -> paid; if a PERSON confirmed it, say who and when
|   isRetryable           -> the cashier said the money never arrived
|
| A manual payment shows no countdown (`expiresIn` is null for one) and
| starts no timer. Its instructions stay reachable from here so the
| customer can re-check what they were told to pay — and stay reachable
| after it is paid, as the receipt.
*/
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmationSourceText, paymentStatusText } from '../../lib/payment';
import PaymentInstructions from './PaymentInstructions';
import Button from '../ui/Button';
import styles from './PaymentStatusPanel.module.css';

function classNames(...names) {
  return names.filter(Boolean).join(' ');
}

/**
 * @param {{payment: object|null, formatDate: (iso: string) => string|null,
 *   onRetry?: () => void, isRetrying?: boolean}} props
 */
export default function PaymentStatusPanel({
  payment,
  formatDate,
  onRetry = null,
  isRetrying = false,
}) {
  const { t } = useTranslation();
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  if (!payment) return null;

  const { confirmation, instructions } = payment;
  const awaiting = payment.awaitingConfirmation;
  /* A person confirmed it — this line is the customer's receipt that
     someone at the store acknowledged their money. */
  const manuallyConfirmed = payment.isPaid && confirmation?.isManual;
  const confirmedAt = confirmation?.confirmedAt ? formatDate(confirmation.confirmedAt) : null;
  /* Hidden at 0 attempts: the server would refuse a fresh request. */
  const canRetry =
    Boolean(onRetry) && payment.isRetryable && (payment.attemptsRemaining ?? 0) > 0;
  const statusLabel = paymentStatusText(t, payment);

  const tone = payment.isPaid
    ? styles.paid
    : awaiting
      ? styles.awaiting
      : payment.isRetryable
        ? styles.failed
        : '';

  return (
    <section className={classNames(styles.panel, tone)} aria-live="polite">
      <div className={styles.head}>
        <span className={styles.mark} aria-hidden="true">
          {payment.isPaid ? '✓' : payment.isRetryable ? '!' : '⏳'}
        </span>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>{t('payment.panelTitle')}</span>
          <b>{statusLabel}</b>
        </div>
      </div>

      {awaiting && <p className={styles.body}>{t('payment.awaiting.body')}</p>}

      {manuallyConfirmed && (
        <div className={styles.confirmation}>
          <span className={styles.confirmationSource}>
            {confirmationSourceText(t, confirmation)}
          </span>
          {confirmation.confirmedBy && (
            <b>
              {confirmedAt
                ? t('payment.confirmedByAt', {
                    name: confirmation.confirmedBy,
                    at: confirmedAt,
                  })
                : t('payment.confirmedBy', { name: confirmation.confirmedBy })}
            </b>
          )}
          {/* Free text the cashier typed, e.g. a till receipt number. */}
          {confirmation.note && <p className={styles.confirmationNote}>{confirmation.note}</p>}
        </div>
      )}

      {payment.failureReason && <p className={styles.failure}>{payment.failureReason}</p>}

      {instructions && (
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

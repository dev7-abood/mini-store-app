/*
|--------------------------------------------------------------------------
| Payment Instructions
|--------------------------------------------------------------------------
| The whole transfer screen in one block: how much, what reference to
| write on the transfer, and the account to pay into.
|
| Rendered whenever `payment.instructions` is non-null — that is the test
| for "this payment is made outside the app", never the method's name. It
| stays present on a PAID manual order as the customer's receipt, so this
| component says nothing about whether the money has arrived; the screen
| around it does.
|
| The rows are the API's, in the API's order. A wallet has no IBAN and a
| bank has no wallet number, so nothing here assumes which rows exist.
*/
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMoney } from '../../hooks/useMoney';
import { useTelegram } from '../../hooks/useTelegram';
import { accountFieldText, isLtrValue } from '../../lib/payment';
import { copyToClipboard } from '../../lib/clipboard';
import styles from './PaymentInstructions.module.css';

/** How long the button stays in its "copied" state. */
const COPIED_MS = 1300;

function classNames(...names) {
  return names.filter(Boolean).join(' ');
}

function CopyButton({ onCopy, copied, label }) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      className={classNames(styles.copyButton, copied && styles.copied)}
      onClick={onCopy}
      aria-label={t('payment.instructions.copyValue', { label })}
    >
      {copied ? t('payment.instructions.copied') : t('payment.instructions.copy')}
    </button>
  );
}

function Row({ label, value, copyable, copied, onCopy }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {/* Account and wallet numbers, IBANs and references are latin
            digit strings: forced LTR so RTL never reorders them. */}
        <b className={styles.rowValue} dir={isLtrValue(value) ? 'ltr' : 'auto'}>
          {value}
        </b>
      </div>
      {copyable && <CopyButton onCopy={onCopy} copied={copied} label={label} />}
    </div>
  );
}

/**
 * @param {{instructions: object, className?: string}} props
 */
export default function PaymentInstructions({ instructions, className = '' }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { haptic, notify } = useTelegram();
  const [copiedKey, setCopiedKey] = useState(null);

  const copy = useCallback(
    async (key, value, label) => {
      try {
        await copyToClipboard(value);
        haptic();
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey(null), COPIED_MS);
        notify(t('payment.instructions.copiedValue', { label }), 'success');
      } catch {
        notify(t('payment.instructions.copyFailed'), 'error');
      }
    },
    [haptic, notify, t],
  );

  if (!instructions) return null;

  /* The order's own frozen currency, not the store default. The amount
     arrives rounded to 2 decimals and is only ever formatted. */
  const amount = money(instructions.amount, instructions.currency);
  const reference = instructions.reference;

  return (
    <div className={classNames(styles.wrap, className)}>
      {(amount || reference) && (
        <div className={styles.headline}>
          {amount && (
            <div className={styles.amountBlock}>
              <span className={styles.headlineLabel}>{t('payment.instructions.amount')}</span>
              <strong className={styles.amount} dir="ltr">{amount}</strong>
            </div>
          )}

          {reference && (
            <div className={styles.referenceBlock}>
              <div className={styles.rowText}>
                <span className={styles.headlineLabel}>
                  {t('payment.instructions.reference')}
                </span>
                {/* The only thing tying the transfer to this order. */}
                <strong className={styles.reference} dir="ltr">{reference}</strong>
              </div>
              <CopyButton
                onCopy={() => copy('reference', reference, t('payment.instructions.reference'))}
                copied={copiedKey === 'reference'}
                label={t('payment.instructions.reference')}
              />
            </div>
          )}

          {reference && (
            <p className={styles.referenceHint}>{t('payment.instructions.referenceHint')}</p>
          )}
        </div>
      )}

      {instructions.rows.length > 0 && (
        <div className={styles.rows}>
          {instructions.rows.map((row, index) => {
            const label = accountFieldText(t, row.field);
            const key = `${row.field}-${index}`;

            return (
              <Row
                key={key}
                label={label}
                value={row.value}
                copyable={row.copyable}
                copied={copiedKey === key}
                onCopy={() => copy(key, row.value, label)}
              />
            );
          })}
        </div>
      )}

      {/* The store's own wording — shown verbatim when it sent one. */}
      {instructions.note && <p className={styles.note}>{instructions.note}</p>}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Payment Check
|--------------------------------------------------------------------------
| The small sum that stands between the customer and "I have paid". It
| renders the question and collects the answer; it does NOT decide
| anything — the screen owns the gate, so this component can never let a
| claim through on its own.
|
| The question is always whole numbers (see lib/paymentVerification.js).
| The figure in it is a rounded copy of the total for the question only:
| the real amount, with its cents, is the one above in PaymentInstructions.
*/
import { useTranslation } from 'react-i18next';
import Field from '../ui/Field';
import styles from './PaymentCheck.module.css';

/**
 * @param {{check: {total: number, addend: number}, value: string,
 *          onChange: (value: string) => void, error?: string,
 *          disabled?: boolean}} props
 */
export default function PaymentCheck({ check, value, onChange, error = '', disabled = false }) {
  const { t } = useTranslation();

  if (!check) return null;

  return (
    <section className={styles.card} aria-labelledby="payment-check-heading">
      <h3 id="payment-check-heading" className={styles.title}>
        {t('manualPayment.check.title')}
      </h3>
      <p className={styles.body}>{t('manualPayment.check.body')}</p>

      {/* Latin digits and a leading operator: forced LTR so the sum reads
          left-to-right inside the RTL layout. */}
      <p className={styles.question} dir="ltr">
        <span>{check.total}</span>
        <span className={styles.operator} aria-hidden="true">+</span>
        <span>{check.addend}</span>
        <span className={styles.operator} aria-hidden="true">=</span>
        <span className={styles.blank} aria-hidden="true">?</span>
      </p>

      <Field
        label={t('manualPayment.check.label')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        disabled={disabled}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={9}
        placeholder={t('manualPayment.check.placeholder')}
        dir="ltr"
        className={styles.input}
      />
    </section>
  );
}

import { useTranslation } from 'react-i18next';
import { AVAILABLE_PAYMENT_METHODS } from '../lib/paymentMethods';
import styles from './PaymentMethodPicker.module.css';

/*
|--------------------------------------------------------------------------
| Payment Method Picker
|--------------------------------------------------------------------------
| Card-style radio group. The selected card is outlined in the tenant's
| primary color, so it themes automatically with branding.
*/

/**
 * @param {{value: string, onChange: (id: string) => void}} props
 */
export default function PaymentMethodPicker({ value, onChange }) {
  const { t } = useTranslation();

  /* A single method is informational, not a decision: the card is shown
     (so the customer knows how they're paying) but not interactive. */
  const single = AVAILABLE_PAYMENT_METHODS.length === 1;

  return (
    <div className={styles.group} role="radiogroup" aria-label={t('payment.title')}>
      {AVAILABLE_PAYMENT_METHODS.map((method) => {
        const selected = value === method.id;

        return (
          <button
            key={method.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`${styles.card} ${selected ? styles.selected : ''} ${single ? styles.single : ''}`}
            disabled={single}
            onClick={() => onChange(method.id)}
          >
            <span className={styles.mark}>
              {method.logo ? (
                <img src={method.logo} alt="" className={styles.logo} />
              ) : (
                <span className={styles.emoji}>{method.icon}</span>
              )}
            </span>

            <span className={styles.text}>
              <b>{t(method.labelKey)}</b>
              <small>{t(method.hintKey)}</small>
            </span>

            <span className={styles.radio} aria-hidden="true">
              {selected && <span className={styles.dot} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

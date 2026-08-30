import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { usePaymentMethods } from '../context/PaymentMethodsContext';
import {
  paymentMethodHint,
  paymentMethodLabel,
  paymentMethodSettlementLabel,
} from '../lib/paymentMethods';
import styles from './PaymentMethodPicker.module.css';

/*
|--------------------------------------------------------------------------
| Payment Method Picker
|--------------------------------------------------------------------------
| Compact card-style radio group, grouped by SETTLEMENT — how the money
| moves — because that is the only distinction the customer needs to make
| here and the only one the app is allowed to reason about.
|
| The groups are built from the settlements the API actually returned, in
| the order it returned them. A settlement value we've never seen still
| gets its own group, labelled with whatever the API called it.
|
| The account rows are deliberately NOT previewed here: at method-choice
| time no order exists, so there is no amount and no reference to show
| beside them. They belong on the instructions screen.
*/

/**
 * @param {{value: string, onChange: (id: string) => void,
 *   renderSelectedAddon?: (method: object) => React.ReactNode}} props
 */
export default function PaymentMethodPicker({ value, onChange, renderSelectedAddon = null }) {
  const { t } = useTranslation();
  const { methods } = usePaymentMethods();

  /* A single method is informational, not a decision: the card is shown
     (so the customer knows how they're paying) but not interactive. */
  const single = methods.length === 1;

  const groups = [];
  for (const method of methods) {
    const key = method.settlement ?? '';
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.methods.push(method);
    } else {
      groups.push({
        key,
        label: paymentMethodSettlementLabel(method, t),
        methods: [method],
      });
    }
  }

  return (
    <div className={styles.group} role="radiogroup" aria-label={t('payment.title')}>
      {groups.map((group) => (
        <section key={group.key} className={styles.category}>
          {group.label && (
            <div className={styles.categoryHeader}>
              <span>{group.label}</span>
            </div>
          )}

          <div className={styles.cards}>
            {group.methods.map((method) => {
              const selected = value === method.id;
              const label = paymentMethodLabel(method, t);
              const hint = paymentMethodHint(method, t);
              const ariaLabel = [label, hint, group.label].filter(Boolean).join(' ');
              const cardClassName = [
                styles.card,
                method.isAutomatic ? styles.smart : styles.peer,
                selected ? styles.selected : '',
                single ? styles.single : '',
              ].filter(Boolean).join(' ');
              const selectedAddon = selected && renderSelectedAddon
                ? renderSelectedAddon(method)
                : null;

              return (
                <Fragment key={method.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={ariaLabel}
                    className={cardClassName}
                    disabled={single}
                    onClick={() => onChange(method.id)}
                  >
                    <span className={styles.mark}>
                      {method.logo ? (
                        <img src={method.logo} alt="" className={styles.logo} />
                      ) : (
                        /* No asset for this method — its initial reads
                           better than a generic placeholder icon. */
                        <span className={styles.emoji}>{label.slice(0, 1)}</span>
                      )}
                    </span>

                    <span className={styles.text}>
                      <span className={styles.titleRow}>
                        <b>{label}</b>
                      </span>
                      {hint && <small className={styles.hint}>{hint}</small>}
                    </span>

                    <span className={styles.radio} aria-hidden="true" />
                  </button>
                  {selectedAddon && (
                    <div className={styles.selectedAddon}>
                      {selectedAddon}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

import { Fragment } from 'react';
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

const PAYMENT_TYPE_ORDER = ['smart', 'manual'];

/**
 * @param {{value: string, onChange: (id: string) => void,
 *   renderSelectedAddon?: (method: object) => React.ReactNode}} props
 */
export default function PaymentMethodPicker({ value, onChange, renderSelectedAddon = null }) {
  const { t } = useTranslation();

  /* A single method is informational, not a decision: the card is shown
     (so the customer knows how they're paying) but not interactive. */
  const single = AVAILABLE_PAYMENT_METHODS.length === 1;
  const groups = PAYMENT_TYPE_ORDER
    .map((type) => ({
      type,
      methods: AVAILABLE_PAYMENT_METHODS.filter((method) => method.type === type),
    }))
    .filter((group) => group.methods.length > 0);

  return (
    <div className={styles.group} role="radiogroup" aria-label={t('payment.title')}>
      {groups.map((group) => (
        <section key={group.type} className={styles.category}>
          <div className={styles.categoryHeader}>
            <span>{t(`payment.types.${group.type}`)}</span>
          </div>

          <div className={styles.cards}>
            {group.methods.map((method) => {
              const selected = value === method.id;
              const methodTypeLabel = t(`payment.types.${method.type}`);
              const methodBadgeLabel = method.badgeKey ? t(method.badgeKey) : '';
              const ariaLabel = [
                t(method.labelKey),
                methodBadgeLabel,
                t(method.hintKey),
                methodTypeLabel,
              ].filter(Boolean).join(' ');
              const cardClassName = [
                styles.card,
                styles[method.type],
                method.recommended ? styles.recommended : '',
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
                        <span className={styles.emoji}>{method.icon}</span>
                      )}
                    </span>

                    <span className={styles.text}>
                      <span className={styles.titleRow}>
                        <b>{t(method.labelKey)}</b>
                        {method.badgeKey && (
                          <span className={styles.badge}>{t(method.badgeKey)}</span>
                        )}
                      </span>
                      <span className={styles.metaRow}>
                        <small>{t(method.hintKey)}</small>
                        <span className={styles.typePill}>{methodTypeLabel}</span>
                      </span>
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

/*
 * The amount rule, said out loud. Rendered on every screen that can
 * still act on it — the cart, the method chooser, the details form and
 * the manual pay-from screen — so the customer reads it in the same
 * place the button it disables sits.
 *
 * Renders NOTHING while the total is fine, or while it is unknown. See
 * checkoutAmountLimits.js: an amount the client cannot judge is the
 * backend's call, and this notice must not pre-empt it.
 */
import { useTranslation } from 'react-i18next';
import { useMoney } from '../hooks/useMoney';
import styles from './CheckoutAmountNotice.module.css';

/**
 * @param {{limit: import('../lib/checkoutAmountLimits').CheckoutAmountLimit}} props
 */
export default function CheckoutAmountNotice({ limit }) {
  const { t } = useTranslation();
  const money = useMoney();

  if (!limit?.isBlocked) return null;

  const { currency } = limit;
  const bounds = { min: money(limit.min, currency), max: money(limit.max, currency) };

  return (
    <aside className={styles.notice} role="alert">
      <span className={styles.icon} aria-hidden="true">!</span>
      <div className={styles.text}>
        <b>{t('checkout.amountLimit.title')}</b>
        <p>{t(limit.messageKey, bounds)}</p>
        {/* The figure they are being refused for, beside the rule it
            broke — so the refusal never reads as a mystery. */}
        <small>{t('checkout.amountLimit.current', { total: money(limit.total, currency) })}</small>
        <small>{t('checkout.amountLimit.range', bounds)}</small>
      </div>
    </aside>
  );
}

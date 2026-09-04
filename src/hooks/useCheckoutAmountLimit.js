import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCart } from '../context/CartContext';
import { useMoney } from './useMoney';
import { checkoutAmountLimit } from '../lib/checkoutAmountLimits';

/** A total the server has actually priced — 0 is one, null and NaN are not. */
function isPriced(total) {
  return total !== null && total !== undefined && total !== '' && Number.isFinite(Number(total));
}

/**
 * The checkout amount rule for the total being paid.
 *
 * Reads the cart's server-priced total by default. A screen holding a
 * closer figure passes it instead — the manual payment preview carries
 * its own totals, frozen with the order's own currency — and falls back
 * to the cart's while that preview is still loading.
 *
 * @param {{total?: number|null, currency?: string|null}} [override]
 * @returns {import('../lib/checkoutAmountLimits').CheckoutAmountLimit}
 */
export function useCheckoutAmountLimit({ total, currency = null } = {}) {
  const { total: cartTotal } = useCart();
  /* The cart carries no currency of its own: it is priced in the store
     default, which is what the bounds are stated in. */
  const useOverride = isPriced(total);
  const amount = useOverride ? total : cartTotal;
  const amountCurrency = useOverride ? currency : null;
  return useMemo(() => checkoutAmountLimit(amount, amountCurrency), [amount, amountCurrency]);
}

/**
 * The one-line version of the rule, for a toast.
 *
 * A screen shows this only when a press gets past the disabled button —
 * the notice on the screen is where the rule is explained properly.
 *
 * @returns {(limit: import('../lib/checkoutAmountLimits').CheckoutAmountLimit) => string}
 */
export function useCheckoutAmountMessage() {
  const { t } = useTranslation();
  const money = useMoney();
  return useCallback(
    (limit) =>
      t('checkout.amountLimit.short', {
        min: money(limit.min, limit.currency),
        max: money(limit.max, limit.currency),
      }),
    [money, t],
  );
}

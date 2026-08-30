import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../lib/money';

/**
 * Currency formatter: the shared 2-decimal `formatMoney()` wrapped in the
 * i18n `common.currency` template, so the symbol and its position stay
 * locale-driven. Never does arithmetic — pass it a server-computed
 * amount, nothing else.
 *
 * @returns {(amount: number|null|undefined) => string|null} null when the
 *   amount is unknown, so callers can render nothing rather than a
 *   made-up zero.
 */
export function useMoney() {
  const { t } = useTranslation();
  return useCallback(
    (amount) => {
      const formatted = formatMoney(amount);
      return formatted === null ? null : t('common.currency', { amount: formatted });
    },
    [t],
  );
}

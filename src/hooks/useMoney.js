import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { currencyCode, currencySymbol, formatMoney } from '../lib/money';

/**
 * Currency formatter: the shared 2-decimal `formatMoney()` wrapped in the
 * i18n `common.currency` template, so the symbol and its position stay
 * locale-driven. Never does arithmetic — pass it a server-computed
 * amount, nothing else.
 *
 * Pass the order's own currency code when the payload carries one (the
 * payment instructions always do); without it the amount renders in the
 * store's default currency template as before.
 *
 * @returns {(amount: number|null|undefined, currency?: string|null) => string|null}
 *   null when the amount is unknown, so callers can render nothing
 *   rather than a made-up zero.
 */
export function useMoney() {
  const { t } = useTranslation();
  return useCallback(
    (amount, currency = null) => {
      const formatted = formatMoney(amount);
      if (formatted === null) return null;

      const symbol = currencySymbol(currency);
      if (symbol) return t('common.currencyWithSymbol', { symbol, amount: formatted });

      const code = currencyCode(currency);
      return code
        ? t('common.currencyWithCode', { code, amount: formatted })
        : t('common.currency', { amount: formatted });
    },
    [t],
  );
}

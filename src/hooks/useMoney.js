import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Currency formatter driven by i18n (`common.currency`), so the symbol
 * and its position can change per locale later.
 *
 * @returns {(amount: number) => string}
 */
export function useMoney() {
  const { t } = useTranslation();
  return useCallback((amount) => t('common.currency', { amount }), [t]);
}

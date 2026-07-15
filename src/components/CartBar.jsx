import { useTranslation } from 'react-i18next';
import { useCart } from '../context/CartContext';
import { useMoney } from '../hooks/useMoney';
import styles from './CartBar.module.css';

/**
 * Floating cart summary bar shown on the menu screen when the cart has
 * at least one item.
 *
 * @param {{onOpenCart: () => void}} props
 */
export default function CartBar({ onOpenCart }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { count, subtotal } = useCart();

  return (
    <button
      type="button"
      className={`${styles.bar} ${count > 0 ? styles.show : ''}`}
      onClick={onOpenCart}
    >
      <span>
        <small>{t('menu.cartBarLabel')}</small>
        {count}
      </span>
      <span className={styles.total}>{money(subtotal)}</span>
      <span className={styles.go}>{t('menu.viewCart')}</span>
    </button>
  );
}

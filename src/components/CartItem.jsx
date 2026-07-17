import { useTranslation } from 'react-i18next';
import { useCatalog } from '../context/CatalogContext';
import { useCart } from '../context/CartContext';
import { useMoney } from '../hooks/useMoney';
import Photo from './ui/Photo';
import Stepper from './ui/Stepper';
import styles from './CartItem.module.css';

/**
 * Single line in the cart list.
 *
 * @param {{product: import('../data/menu').Product, qty: number}} props
 */
export default function CartItem({ product, qty }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { categoryById } = useCatalog();
  const { changeQty } = useCart();
  const tint = categoryById.get(product.category)?.tint;

  return (
    <div className={styles.item}>
      <Photo
        className={styles.thumb}
        src={product.image}
        fallback={product.fallback}
        tint={tint}
        fallbackSize="28px"
      />
      <div className={styles.info}>
        <div className={styles.name}>{product.name}</div>
        <div className={styles.price}>{money(product.price * qty)}</div>
      </div>
      <Stepper mini value={qty} onChange={(delta) => changeQty(product.id, delta)} />
    </div>
  );
}

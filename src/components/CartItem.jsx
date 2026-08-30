import { useTranslation } from 'react-i18next';
import { useCatalog } from '../context/CatalogContext';
import { useCart } from '../context/CartContext';
import { useMoney } from '../hooks/useMoney';
import { useBusinessTypeConfig } from '../hooks/useBusinessTypeConfig';
import Photo from './ui/Photo';
import Stepper from './ui/Stepper';
import styles from './CartItem.module.css';

/**
 * Single line in the cart list.
 *
 * `lineTotal` is the server's `line_total` for this line — displayed as
 * given, never recomputed from price × quantity. It is null while the
 * backend hasn't priced the line yet, and the amount is simply omitted.
 *
 * @param {{product: import('../data/menu').Product, qty: number,
 *          lineTotal: number|null}} props
 */
export default function CartItem({ product, qty, lineTotal }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { categoryById } = useCatalog();
  const { changeQty } = useCart();
  const { placeholders } = useBusinessTypeConfig();
  const tint = categoryById.get(product.category)?.tint;

  return (
    <div className={styles.item}>
      <Photo
        className={styles.thumb}
        src={product.image}
        fallback={product.fallback || placeholders.product[0]}
        tint={tint}
        fallbackSize="28px"
      />
      <div className={styles.info}>
        <div className={styles.name}>{product.name}</div>
        <div className={styles.price}>{money(lineTotal)}</div>
      </div>
      <Stepper mini value={qty} onChange={(delta) => changeQty(product.id, delta)} />
    </div>
  );
}

import { useCatalog } from '../context/CatalogContext';
import { useCart } from '../context/CartContext';
import { useMoney } from '../hooks/useMoney';
import { useBusinessTypeConfig } from '../hooks/useBusinessTypeConfig';
import Photo from './ui/Photo';
import Stepper from './ui/Stepper';
import styles from './CartProductGroup.module.css';

/**
 * One product card in the cart for a product with price options: the
 * product shown once, then every selected option as its own row with an
 * independent quantity stepper (wired to that option's cart line).
 *
 * @param {{product: import('../data/menu').Product,
 *          lines: Array<{key: string, priceOption: object|null, qty: number}>}} props
 */
export default function CartProductGroup({ product, lines }) {
  const money = useMoney();
  const { categoryById } = useCatalog();
  const { changeQty } = useCart();
  const { placeholders } = useBusinessTypeConfig();
  const tint = categoryById.get(product.category)?.tint;

  return (
    <div className={styles.group}>
      <div className={styles.head}>
        <Photo
          className={styles.thumb}
          src={product.image}
          fallback={product.fallback || placeholders.product[0]}
          tint={tint}
          fallbackSize="28px"
        />
        <div className={styles.name}>{product.name}</div>
      </div>
      {lines.map((line) => (
        <div key={line.key} className={styles.optionRow}>
          <div className={styles.info}>
            <div className={styles.optionName}>{line.priceOption?.name}</div>
            <div className={styles.price}>{money(line.priceOption.finalPrice * line.qty)}</div>
          </div>
          <Stepper
            mini
            value={line.qty}
            onChange={(delta) => changeQty(product.id, delta, line.priceOption.id)}
          />
        </div>
      ))}
    </div>
  );
}

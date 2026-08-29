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
      {lines.map((line) => {
        /* priceOption is only ever null for a leftover plain line (e.g.
           added before this product had price options) sharing the
           group with real option lines — fall back to the product's
           own name/price rather than breaking the whole cart over it. */
        const unitPrice = line.priceOption ? line.priceOption.finalPrice : product.price;
        return (
          <div key={line.key} className={styles.optionRow}>
            <div className={styles.info}>
              <div className={styles.optionName}>{line.priceOption?.name ?? product.name}</div>
              <div className={styles.price}>{money(unitPrice * line.qty)}</div>
            </div>
            <Stepper
              mini
              value={line.qty}
              onChange={(delta) => changeQty(product.id, delta, line.priceOption?.id ?? null)}
            />
          </div>
        );
      })}
    </div>
  );
}

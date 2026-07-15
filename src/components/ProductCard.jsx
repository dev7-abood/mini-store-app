import { useTranslation } from 'react-i18next';
import { useMoney } from '../hooks/useMoney';
import Photo from './ui/Photo';
import styles from './ProductCard.module.css';

/**
 * Menu grid card. Tapping the card opens the detail sheet; the plus
 * button quick-adds one unit without opening it.
 *
 * @param {{product: import('../data/menu').Product, tint: string,
 *          onOpen: () => void, onQuickAdd: () => void}} props
 */
export default function ProductCard({ product, tint, onOpen, onQuickAdd }) {
  const { t } = useTranslation();
  const money = useMoney();

  return (
    <div
      className={styles.card}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <Photo
        className={styles.img}
        src={product.image}
        fallback={product.fallback}
        tint={tint}
        fallbackSize="48px"
      />
      <div className={styles.name}>{t(`products.${product.id}.name`)}</div>
      <div className={styles.desc}>{t(`products.${product.id}.desc`)}</div>
      <div className={styles.foot}>
        <span className={styles.price}>{money(product.price)}</span>
        <button
          type="button"
          className={styles.add}
          onClick={(e) => {
            e.stopPropagation();
            onQuickAdd();
          }}
          aria-label="+"
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Shimmer placeholder shown while the catalog is loading from the API. */
export function ProductCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.skImg} />
      <div className={styles.skLine} />
      <div className={`${styles.skLine} ${styles.skShort}`} />
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { useMoney } from '../hooks/useMoney';
import { useBusinessTypeConfig } from '../hooks/useBusinessTypeConfig';
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
  const money = useMoney();
  const { t } = useTranslation();
  const { placeholders } = useBusinessTypeConfig();
  const soldOut = product.available === false;

  return (
    <div
      className={`${styles.card} ${soldOut ? styles.soldOutCard : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className={styles.imgWrap}>
        <Photo
          className={`${styles.img} ${soldOut ? styles.imgMuted : ''}`}
          src={product.image}
          fallback={product.fallback || placeholders.product[0]}
          tint={tint}
          fallbackSize="48px"
        />
        {soldOut && <span className={styles.soldOutBadge}>{t('product.soldOut')}</span>}
      </div>
      <div className={styles.name}>{product.name}</div>
      <div className={styles.desc}>{product.desc}</div>
      <div className={styles.foot}>
        <span className={styles.price}>
          {money(product.price)}
          {product.onSale && (
            <s className={styles.oldPrice}>{money(product.originalPrice)}</s>
          )}
        </span>
        <button
          type="button"
          className={`${styles.add} ${soldOut ? styles.addDisabled : ''}`}
          disabled={soldOut}
          onClick={(e) => {
            e.stopPropagation();
            if (!soldOut) onQuickAdd();
          }}
          aria-label={soldOut ? t('product.soldOut') : '+'}
        >
          {soldOut ? '\u2014' : '+'}
        </button>
      </div>
    </div>
  );
}

/** Shimmer placeholder shown while the catalog is loading from the API. */
export function ProductCardSkeleton() {
  const { skeleton } = useBusinessTypeConfig();

  return (
    <div
      className={`${styles.card} ${styles.skeletonCard} ${styles[`${skeleton.variant}Skeleton`]}`}
      aria-hidden="true"
    >
      <div className={styles.skImg}>
        <span className={styles.skAccent} />
      </div>
      <div className={styles.skLine} />
      <div className={`${styles.skLine} ${styles.skShort}`} />
      <div className={styles.skFoot}>
        <span className={styles.skPrice} />
        <span className={styles.skAction} />
      </div>
    </div>
  );
}

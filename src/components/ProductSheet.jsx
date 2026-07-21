import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../context/CatalogContext';
import { useCart } from '../context/CartContext';
import { useTelegram } from '../hooks/useTelegram';
import { useMoney } from '../hooks/useMoney';
import Photo from './ui/Photo';
import Stepper from './ui/Stepper';
import Button from './ui/Button';
import styles from './ProductSheet.module.css';

/**
 * Bottom sheet with product details + quantity picker.
 *
 * @param {{product: import('../data/menu').Product | null, onClose: () => void}} props
 */
export default function ProductSheet({ product, onClose }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { categoryById } = useCatalog();
  const { addItem } = useCart();
  const { haptic } = useTelegram();
  const [qty, setQty] = useState(1);

  /* Reset quantity every time a new product opens. */
  useEffect(() => {
    if (product) setQty(1);
  }, [product]);

  /* Escape closes the sheet (desktop convenience). */
  useEffect(() => {
    if (!product) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, onClose]);

  const open = Boolean(product);
  const tint = product ? categoryById.get(product.category)?.tint : undefined;

  const changeQty = (delta) => {
    setQty((q) => Math.max(1, q + delta));
    haptic();
  };

  const addToCart = () => {
    addItem(product.id, qty);
    haptic('medium');
    onClose();
  };

  return (
    <>
      <div
        className={`${styles.veil} ${open ? styles.veilShow : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={`${styles.sheet} ${open ? styles.sheetShow : ''}`} role="dialog" aria-modal="true">
        <div className={styles.grab} />
        {product && (
          <>
            <Photo
              key={product.id}
              className={styles.img}
              src={product.image}
              fallback={product.fallback}
              tint={tint}
              fallbackSize="80px"
            />
            <h2 className={styles.name}>{product.name}</h2>
            <p className={styles.priceRow}>
              <b>{money(product.price)}</b>
              {product.discount > 0 && <s>{money(product.originalPrice)}</s>}
            </p>
            <p className={styles.desc}>{product.desc}</p>
            <div className={styles.qtyRow}>
              <Stepper value={qty} onChange={changeQty} />
              <Button grow onClick={addToCart}>
                {t('sheet.add', { price: money(product.price * qty) })}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

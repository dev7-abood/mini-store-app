import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../context/CatalogContext';
import { useCart } from '../context/CartContext';
import { useTelegram } from '../hooks/useTelegram';
import { useMoney } from '../hooks/useMoney';
import { useBusinessTypeConfig } from '../hooks/useBusinessTypeConfig';
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
  const { placeholders } = useBusinessTypeConfig();
  const [qty, setQty] = useState(1);
  const [selectedOptionId, setSelectedOptionId] = useState(null);

  /* Reset quantity, and default to the cheapest variant, every time a
     new product opens. */
  useEffect(() => {
    if (!product) return;
    setQty(1);
    setSelectedOptionId(
      product.priceOptions?.length > 0
        ? product.priceOptions.reduce((min, o) => (o.finalPrice < min.finalPrice ? o : min), product.priceOptions[0]).id
        : null,
    );
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
  const hasOptions = product?.priceOptions?.length > 0;
  const selectedOption = hasOptions
    ? product.priceOptions.find((o) => o.id === selectedOptionId) ?? product.priceOptions[0]
    : null;

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
              fallback={product.fallback || placeholders.product[0]}
              tint={tint}
              fallbackSize="80px"
            />
            <h2 className={styles.name}>{product.name}</h2>
            <p className={styles.priceRow}>
              {hasOptions ? (
                selectedOption && (
                  <>
                    <b>{money(selectedOption.finalPrice)}</b>
                    {selectedOption.onSale && <s>{money(selectedOption.price)}</s>}
                  </>
                )
              ) : (
                <>
                  <b>{money(product.price)}</b>
                  {product.onSale && <s>{money(product.originalPrice)}</s>}
                </>
              )}
            </p>
            {hasOptions && (
              <div className={styles.optionRow} role="group" aria-label={t('product.selectOption')}>
                {product.priceOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`${styles.optionPill} ${
                      option.id === selectedOptionId ? styles.optionPillActive : ''
                    }`}
                    onClick={() => setSelectedOptionId(option.id)}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            )}
            <p className={styles.desc}>{product.desc}</p>
            {product.available === false ? (
              /* Out of stock: keep the item fully browsable, explain
                 warmly why it can't be ordered, and offer no add path. */
              <div className={styles.soldOutNotice}>
                <span className={styles.soldOutIcon}>🕒</span>
                <div>
                  <b>{t('product.soldOutTitle')}</b>
                  <p>{t('product.soldOutBody')}</p>
                </div>
              </div>
            ) : hasOptions ? (
              /* Cart/checkout can't yet carry a selected price option
                 through to the order, so ordering is stubbed until that's
                 wired up backend-side. The selector and price above still
                 work fully. */
              <div className={styles.variantNotice}>{t('product.variantSoon')}</div>
            ) : (
              <div className={styles.qtyRow}>
                <Stepper value={qty} onChange={changeQty} />
                <Button grow onClick={addToCart}>
                  {t('sheet.add', { price: money(product.price * qty) })}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

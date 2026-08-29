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
 * Bottom sheet with product details + quantity picker. Products with
 * price options replace the single quantity stepper with a multi-select
 * list — each option gets its own stepper (0 = unselected), and every
 * selected option is added as its own cart line in one atomic call.
 *
 * @param {{product: import('../data/menu').Product | null, onClose: () => void}} props
 */
export default function ProductSheet({ product, onClose }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { categoryById } = useCatalog();
  const { addItem, addItemWithOptions } = useCart();
  const { haptic } = useTelegram();
  const { placeholders } = useBusinessTypeConfig();
  const [qty, setQty] = useState(1);
  /* price_option_id -> selected quantity; absent/0 means unselected. */
  const [optionQty, setOptionQty] = useState({});

  /* Reset quantity and clear every option's selection each time a new
     product opens. */
  useEffect(() => {
    if (product) {
      setQty(1);
      setOptionQty({});
    }
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

  const changeQty = (delta) => {
    setQty((q) => Math.max(1, q + delta));
    haptic();
  };

  const changeOptionQty = (optionId, delta) => {
    setOptionQty((prev) => ({ ...prev, [optionId]: Math.max(0, (prev[optionId] ?? 0) + delta) }));
    haptic();
  };

  const addToCart = () => {
    addItem(product.id, qty);
    haptic('medium');
    onClose();
  };

  const selectedOptions = hasOptions
    ? product.priceOptions.filter((o) => (optionQty[o.id] ?? 0) > 0)
    : [];
  const selectedPieces = selectedOptions.reduce((sum, o) => sum + optionQty[o.id], 0);
  const selectedTotal = selectedOptions.reduce((sum, o) => sum + o.finalPrice * optionQty[o.id], 0);

  const addOptionsToCart = () => {
    if (selectedOptions.length === 0) return;
    addItemWithOptions(
      product.id,
      selectedOptions.map((o) => ({ priceOptionId: o.id, quantity: optionQty[o.id] })),
    );
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
            {!hasOptions && (
              <p className={styles.priceRow}>
                <b>{money(product.price)}</b>
                {product.onSale && <s>{money(product.originalPrice)}</s>}
              </p>
            )}
            <p className={styles.desc}>{product.desc}</p>
            {hasOptions && (
              <div className={styles.optionsSection}>
                <div className={styles.optionsHeading}>
                  <span>{t('product.optionsTitle')}</span>
                  <span className={styles.requiredBadge}>{t('product.optionsRequired')}</span>
                </div>
                <p className={styles.optionsHint}>{t('product.optionsHint')}</p>
                <div className={styles.optionsList}>
                  {product.priceOptions.map((option) => (
                    <div
                      key={option.id}
                      className={`${styles.optionRow} ${
                        (optionQty[option.id] ?? 0) > 0 ? styles.optionRowActive : ''
                      }`}
                    >
                      <div className={styles.optionInfo}>
                        <span className={styles.optionName}>{option.name}</span>
                        <span className={styles.optionPrice}>
                          {money(option.finalPrice)}
                          {option.onSale && <s>{money(option.price)}</s>}
                        </span>
                      </div>
                      <Stepper
                        mini
                        value={optionQty[option.id] ?? 0}
                        onChange={(delta) => changeOptionQty(option.id, delta)}
                      />
                    </div>
                  ))}
                </div>
                {selectedOptions.length > 0 && (
                  <p className={styles.optionsSummary}>
                    {t('product.optionsSummary', {
                      options: selectedOptions.length,
                      pieces: selectedPieces,
                      total: money(selectedTotal),
                    })}
                  </p>
                )}
              </div>
            )}
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
              <Button grow disabled={selectedOptions.length === 0} onClick={addOptionsToCart}>
                {selectedOptions.length > 0
                  ? t('sheet.add', { price: money(selectedTotal) })
                  : t('product.selectAtLeastOne')}
              </Button>
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

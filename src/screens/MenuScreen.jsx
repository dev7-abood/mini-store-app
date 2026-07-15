import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, CATEGORY_BY_ID, PRODUCTS } from '../data/menu';
import { useCart } from '../context/CartContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import Screen from '../components/ui/Screen';
import BrandLogo from '../components/BrandLogo';
import CategoryChips from '../components/CategoryChips';
import ProductCard from '../components/ProductCard';
import ProductSheet from '../components/ProductSheet';
import CartBar from '../components/CartBar';
import styles from './MenuScreen.module.css';

/** Main catalog screen: category chips, product grid, cart bar + sheet. */
export default function MenuScreen() {
  const { t } = useTranslation();
  const { navigate } = useNavigation();
  const { addItem, count } = useCart();
  const { haptic, user } = useTelegram();

  /* Greet by first name, fall back to @username, then the generic line. */
  const displayName = user?.first_name || (user?.username ? `@${user.username}` : null);
  const subtitle = displayName ? t('menu.welcome', { name: displayName }) : t('menu.subtitle');

  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
  const [sheetProduct, setSheetProduct] = useState(null);

  const products = useMemo(
    () => PRODUCTS.filter((p) => p.category === activeCategory),
    [activeCategory],
  );
  const tint = CATEGORY_BY_ID.get(activeCategory)?.tint;

  const pickCategory = (id) => {
    setActiveCategory(id);
    haptic();
  };

  const quickAdd = (id) => {
    addItem(id, 1);
    haptic('medium');
  };

  return (
    <Screen>
      <header className={styles.topbar}>
        <div className={styles.miniLogo}>
          <BrandLogo variant="light" size={26} />
        </div>
        <div className={styles.title}>
          <h1>{t('brand.name')}</h1>
          <p>{subtitle}</p>
        </div>
        <button
          type="button"
          className={styles.cartBtn}
          onClick={() => navigate(SCREENS.CART)}
          aria-label={t('cart.title')}
        >
          🛒
          {count > 0 && <span className={styles.badge}>{count}</span>}
        </button>
      </header>

      <CategoryChips activeId={activeCategory} onPick={pickCategory} />

      <main className={styles.grid}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            tint={tint}
            onOpen={() => {
              setSheetProduct(product);
              haptic();
            }}
            onQuickAdd={() => quickAdd(product.id)}
          />
        ))}
      </main>

      <CartBar onOpenCart={() => navigate(SCREENS.CART)} />
      <ProductSheet product={sheetProduct} onClose={() => setSheetProduct(null)} />
    </Screen>
  );
}

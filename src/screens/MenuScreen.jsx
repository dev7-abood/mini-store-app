import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../context/CatalogContext';
import { useCart } from '../context/CartContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import Screen from '../components/ui/Screen';
import BrandLogo from '../components/BrandLogo';
import CategoryChips from '../components/CategoryChips';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard';
import InfiniteScrollSentinel from '../components/InfiniteScrollSentinel';
import ProductSheet from '../components/ProductSheet';
import CartBar from '../components/CartBar';
import styles from './MenuScreen.module.css';

const SKELETON_COUNT = 6;

/** Main catalog screen: category chips, product grid, cart bar + sheet. */
export default function MenuScreen() {
  const { t } = useTranslation();
  const { categories, products, categoryById, isLoading, isLoadingMore, hasMore, loadMore } = useCatalog();
  const { navigate } = useNavigation();
  const { addItem, count } = useCart();
  const { haptic, user } = useTelegram();

  const [pickedCategory, setPickedCategory] = useState(null);
  const [sheetProduct, setSheetProduct] = useState(null);

  /* Until the user picks, follow the first category from the catalog. */
  const activeCategory = pickedCategory ?? categories[0]?.id ?? null;

  /* Greet by first name, fall back to @username, then the generic line. */
  const displayName = user?.first_name || (user?.username ? `@${user.username}` : null);
  const subtitle = displayName ? t('menu.welcome', { name: displayName }) : t('menu.subtitle');

  const visibleProducts = useMemo(
    () => products.filter((p) => p.category === activeCategory),
    [products, activeCategory],
  );
  const tint = activeCategory ? categoryById.get(activeCategory)?.tint : undefined;

  const pickCategory = (id) => {
    setPickedCategory(id);
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
        {isLoading ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => <ProductCardSkeleton key={i} />)
        ) : (
          <>
            {visibleProducts.map((product) => (
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
            {/* Bottom-of-grid loader while the next page fetches. */}
            {isLoadingMore && (
              <>
                <ProductCardSkeleton />
                <ProductCardSkeleton />
              </>
            )}
          </>
        )}
      </main>

      {/* Fetches the next /front-data page when the user scrolls near
          the end. Disabled while page 1 is still loading or the list
          is exhausted so it never fires when there's nothing to do. */}
      <InfiniteScrollSentinel
        enabled={!isLoading && hasMore && !isLoadingMore}
        onIntersect={loadMore}
      />

      <CartBar onOpenCart={() => navigate(SCREENS.CART)} />
      <ProductSheet product={sheetProduct} onClose={() => setSheetProduct(null)} />
    </Screen>
  );
}

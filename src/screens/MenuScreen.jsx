import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../context/CatalogContext';
import { useBranding } from '../context/BrandingContext';
import { searchProducts } from '../lib/search';
import { useCart } from '../context/CartContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import Screen from '../components/ui/Screen';
import BrandLogo from '../components/BrandLogo';
import CategoryChips from '../components/CategoryChips';
import SearchBar from '../components/SearchBar';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard';
import InfiniteScrollSentinel from '../components/InfiniteScrollSentinel';
import ProductSheet from '../components/ProductSheet';
import CartBar from '../components/CartBar';
import { StoreStatusNotice, StoreStatusPill } from '../components/StoreStatus';
import styles from './MenuScreen.module.css';

const SKELETON_COUNT = 6;

/** Main catalog screen: category chips, product grid, cart bar + sheet. */
export default function MenuScreen() {
  const { t } = useTranslation();
  const { categories, products, categoryById, isLoading, isLoadingMore, hasMore, loadMore } = useCatalog();
  const { navigate } = useNavigation();
  const { addItem, count } = useCart();
  const { haptic, user } = useTelegram();
  const { branding } = useBranding();

  const [pickedCategory, setPickedCategory] = useState(null);
  const [sheetProduct, setSheetProduct] = useState(null);

  /* Until the user picks, follow the first category from the catalog. */
  const [query, setQuery] = useState('');
  const activeCategory = pickedCategory ?? categories[0]?.id ?? null;

  /* Greet by first name, fall back to @username, then the generic line. */
  const displayName = user?.first_name || (user?.username ? `@${user.username}` : null);
  const subtitle = displayName ? t('menu.welcome', { name: displayName }) : branding.tagline;

  /* searchProducts returns null when the query is too short — that's
     the signal to fall back to normal category browsing. */
  const searchResults = useMemo(() => searchProducts(products, query), [products, query]);
  const isSearching = searchResults !== null;

  const visibleProducts = useMemo(
    () => (isSearching ? searchResults : products.filter((p) => p.category === activeCategory)),
    [isSearching, searchResults, products, activeCategory],
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
        <div
          className={`${styles.miniLogo} ${branding.logo_url ? styles.miniLogoImg : ''}`}
          /* Header mark scales with the branch's logo_size setting,
             capped so a large logo can't crowd out the title. */
          style={
            branding.logo_url
              ? {
                  width: `${Math.min(Number(branding.logo_size) || 64, 56)}px`,
                  height: `${Math.min(Number(branding.logo_size) || 64, 56)}px`,
                }
              : undefined
          }
        >
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }}
            />
          ) : (
            <BrandLogo variant="light" size={26} />
          )}
        </div>
        <div className={styles.title}>
          <h1>{branding.name}</h1>
          <p>{subtitle}</p>
          <StoreStatusPill />
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

      <div className={styles.searchWrap}>
        <SearchBar value={query} onChange={setQuery} onClear={() => setQuery('')} />
      </div>
      <StoreStatusNotice />

      {/* Categories are irrelevant while searching — results span all. */}
      {!isSearching && <CategoryChips activeId={activeCategory} onPick={pickCategory} />}

      <main className={styles.grid}>
        {isLoading ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => <ProductCardSkeleton key={i} />)
        ) : (
          <>
            {isSearching && visibleProducts.length === 0 && (
              <div className={styles.noResults}>
                <span className={styles.noResultsIcon}>🔎</span>
                <b>{t('search.emptyTitle')}</b>
                <p>{t('search.emptyBody', { query })}</p>
              </div>
            )}

            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                tint={isSearching ? undefined : tint}
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
      {/* Pagination pauses during a search: results are matched against
          the products already loaded, so an endless fetch would be
          confusing while the customer is reading matches. */}
      <InfiniteScrollSentinel
        enabled={!isSearching && !isLoading && hasMore && !isLoadingMore}
        onIntersect={loadMore}
      />

      <CartBar onOpenCart={() => navigate(SCREENS.CART)} />
      <ProductSheet product={sheetProduct} onClose={() => setSheetProduct(null)} />
    </Screen>
  );
}

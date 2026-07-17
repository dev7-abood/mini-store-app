/*
|--------------------------------------------------------------------------
| Catalog Context
|--------------------------------------------------------------------------
| Loads the live catalog from the Laravel API on boot. If no backend is
| configured or the request fails, the built-in seed keeps the app fully
| usable (source: 'static').
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchCatalog, hasBackend } from '../api/client';
import {
  FALLBACK_CATEGORIES,
  FALLBACK_PRODUCTS,
  FALLBACK_DELIVERY_FEE,
} from '../data/menu';

const CatalogContext = createContext(null);

const INITIAL = {
  status: 'loading', // 'loading' | 'ready'
  source: null, // 'api' | 'static'
  categories: [],
  products: [],
  deliveryFee: FALLBACK_DELIVERY_FEE,
};

export function CatalogProvider({ children }) {
  const [state, setState] = useState(INITIAL);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));

    if (hasBackend()) {
      try {
        const catalog = await fetchCatalog();
        if (catalog.products.length > 0) {
          setState({ status: 'ready', source: 'api', ...catalog });
          return;
        }
        console.warn('Catalog API returned no products — using the seed.');
      } catch (error) {
        console.warn('Catalog fetch failed — using the seed:', error);
      }
    }

    setState({
      status: 'ready',
      source: 'static',
      categories: FALLBACK_CATEGORIES,
      products: FALLBACK_PRODUCTS,
      deliveryFee: FALLBACK_DELIVERY_FEE,
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(
    () => ({
      ...state,
      isLoading: state.status === 'loading',
      /** @type {Map<number, object>} */
      productById: new Map(state.products.map((p) => [p.id, p])),
      /** @type {Map<string, object>} */
      categoryById: new Map(state.categories.map((c) => [c.id, c])),
      reload: load,
    }),
    [state, load],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return ctx;
}

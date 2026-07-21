/*
|--------------------------------------------------------------------------
| Catalog Context
|--------------------------------------------------------------------------
| Loads the storefront from GET /front-data with true infinite scroll:
| page 1 lands immediately on mount; loadMore() fetches the next page
| on demand (called by an IntersectionObserver sentinel in MenuScreen)
| until has_more is false. Catalogs/products merge with dedupe as pages
| arrive so a category's items across pages all end up together.
|
| Data policy: the app shows ONLY tenant data. A failed or empty
| /front-data becomes status 'error' with a retry — never fake data.
| If no tenant backend is configured at all, we still error out;
| there is no seed to fall back to.
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchFrontData, hasBackend } from '../api/client';
import { useTenant } from './TenantContext';

const CatalogContext = createContext(null);

/** Default delivery fee until the API surfaces one via meta.delivery_fee. */
const DEFAULT_DELIVERY_FEE = 10;

const INITIAL = {
  status: 'loading',    // 'loading' | 'ready' | 'error'
  categories: [],
  products: [],
  deliveryFee: DEFAULT_DELIVERY_FEE,
  page: 0,              // last successfully loaded page
  hasMore: false,       // more pages waiting on the backend
  isLoadingMore: false, // a next-page fetch is in flight
};

/** Append unseen categories, preserving first-seen (merchant) order. */
function mergeCategories(existing, incoming) {
  const known = new Set(existing.map((c) => c.id));
  return [...existing, ...incoming.filter((c) => !known.has(c.id))];
}

/** Append unseen products (dedupe by id). */
function mergeProducts(existing, incoming) {
  const known = new Set(existing.map((p) => p.id));
  return [...existing, ...incoming.filter((p) => !known.has(p.id))];
}

export function CatalogProvider({ children }) {
  const tenant = useTenant();
  const [state, setState] = useState(INITIAL);
  /* Generation counter: a reload invalidates any in-flight page. */
  const generationRef = useRef(0);

  /** Initial load (page 1). */
  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    const isCurrent = () => generation === generationRef.current;

    setState((s) => ({ ...s, status: 'loading' }));

    if (!hasBackend()) {
      /* Nothing to fetch — surface the error instead of hiding it. */
      console.warn('No tenant backend configured — /front-data is unreachable.');
      setState((s) => ({ ...s, status: 'error', isLoadingMore: false }));
      return;
    }

    try {
      const first = await fetchFrontData(1);
      if (!isCurrent()) return;

      if (first.products.length === 0) {
        console.warn('front-data returned no products.');
        setState((s) => ({ ...s, status: 'error', isLoadingMore: false }));
        return;
      }

      setState({
        status: 'ready',
        categories: first.categories,
        products: first.products,
        deliveryFee: first.deliveryFee ?? DEFAULT_DELIVERY_FEE,
        page: 1,
        hasMore: first.hasMore,
        isLoadingMore: false,
      });
    } catch (error) {
      console.warn('front-data fetch failed:', error);
      if (isCurrent()) setState((s) => ({ ...s, status: 'error', isLoadingMore: false }));
    }
  }, []);

  /**
   * Fetch the next page and merge it in. Safe to call repeatedly — an
   * in-flight fetch or an exhausted list is a no-op.
   */
  const loadMore = useCallback(async () => {
    const generation = generationRef.current;
    const isCurrent = () => generation === generationRef.current;

    /* Read the freshest state via functional setState to guard against
       stale closures triggering duplicate fetches. */
    let shouldFetch = false;
    let nextPage = 0;
    setState((s) => {
      if (s.status !== 'ready' || !s.hasMore || s.isLoadingMore) {
        return s;
      }
      shouldFetch = true;
      nextPage = s.page + 1;
      return { ...s, isLoadingMore: true };
    });
    if (!shouldFetch) return;

    try {
      const next = await fetchFrontData(nextPage);
      if (!isCurrent()) return;
      setState((s) => ({
        ...s,
        categories: mergeCategories(s.categories, next.categories),
        products: mergeProducts(s.products, next.products),
        page: nextPage,
        hasMore: next.hasMore,
        isLoadingMore: false,
      }));
    } catch (error) {
      console.warn(`front-data page ${nextPage} failed:`, error);
      if (isCurrent()) {
        /* Stop the loop but keep the pages we already have — the user
           can still browse what loaded before the error. */
        setState((s) => ({ ...s, hasMore: false, isLoadingMore: false }));
      }
    }
  }, []);

  /* Load only after the tenant is resolved — the base URL must be
     configured first. While the tenant resolves, status stays 'loading'
     so the splash keeps showing. */
  useEffect(() => {
    if (tenant.status === 'ready') load();
  }, [tenant.status, load]);

  const value = useMemo(
    () => ({
      ...state,
      isLoading: state.status === 'loading',
      isError: state.status === 'error',
      /** @type {Map<number, object>} */
      productById: new Map(state.products.map((p) => [p.id, p])),
      /** @type {Map<string, object>} */
      categoryById: new Map(state.categories.map((c) => [c.id, c])),
      reload: load,
      loadMore,
    }),
    [state, load, loadMore],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return ctx;
}

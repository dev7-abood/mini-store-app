/*
|--------------------------------------------------------------------------
| Cart Context (server-persisted, optimistic)
|--------------------------------------------------------------------------
| State is a reducer keyed by product id -> quantity. Product data and the
| delivery fee come from the catalog; entries for products no longer in
| the catalog are ignored gracefully.
|
| Sync model — LOCAL FIRST, SERVER BEHIND:
|   • Every tap updates local state immediately, so the UI never waits on
|     the network. The matching request fires in the background.
|   • On failure the change is ROLLED BACK to the last server-confirmed
|     state, so the cart can never silently disagree with the backend.
|   • On launch the server cart is fetched and adopted. If the customer
|     already has local items (added before hydration finished), the two
|     are merged and pushed back with PUT /cart.
|
| Hydration waits for the customer sync: the cart routes sit behind
| `telegram.customer`, so calling them earlier would 4xx.
|
| With no backend configured the cart still works fully — it just stays
| in memory for the session.
*/
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useCatalog } from './CatalogContext';
import { useCustomer } from './CustomerContext';
import {
  hasBackend,
  fetchCart,
  syncCart,
  clearCartRemote,
  addCartItem,
  updateCartItem,
  removeCartItem,
} from '../api/client';

const CartContext = createContext(null);

/** @typedef {Record<number, number>} CartState  product id -> quantity */

/**
 * @param {CartState} state
 * @param {{type: 'add'|'change'|'set'|'replace'|'clear', id?: number,
 *          qty?: number, delta?: number, items?: CartState}} action
 * @returns {CartState}
 */
function cartReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const current = state[action.id] ?? 0;
      return { ...state, [action.id]: current + (action.qty ?? 1) };
    }
    case 'change': {
      const next = (state[action.id] ?? 0) + action.delta;
      if (next <= 0) {
        const { [action.id]: _removed, ...rest } = state;
        return rest;
      }
      return { ...state, [action.id]: next };
    }
    case 'set': {
      if (action.qty <= 0) {
        const { [action.id]: _removed, ...rest } = state;
        return rest;
      }
      return { ...state, [action.id]: action.qty };
    }
    /* Adopt a server snapshot wholesale. */
    case 'replace':
      return { ...(action.items ?? {}) };
    case 'clear':
      return {};
    default:
      return state;
  }
}

/** Merge two carts by taking the larger quantity per product. */
function mergeCarts(a, b) {
  const merged = { ...a };
  for (const [id, qty] of Object.entries(b)) {
    merged[id] = Math.max(merged[id] ?? 0, qty);
  }
  return merged;
}

export function CartProvider({ children }) {
  const { productById, deliveryFee } = useCatalog();
  const { synced: customerSynced } = useCustomer();
  const [items, dispatch] = useReducer(cartReducer, {});
  const [isSyncing, setIsSyncing] = useState(false);

  /* Last state the server confirmed — the rollback target. */
  const confirmedRef = useRef({});
  /* Latest local state, readable inside async callbacks without
     re-creating them on every keystroke. */
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const remoteEnabled = hasBackend();

  /*
  |--------------------------------------------------------------------------
  | Hydration
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!remoteEnabled || !customerSynced) return;

    let cancelled = false;

    (async () => {
      setIsSyncing(true);
      const serverItems = await fetchCart();
      if (cancelled || serverItems === null) {
        setIsSyncing(false);
        return;
      }

      const localItems = itemsRef.current;
      const hasLocal = Object.keys(localItems).length > 0;

      if (!hasLocal) {
        confirmedRef.current = serverItems;
        dispatch({ type: 'replace', items: serverItems });
        setIsSyncing(false);
        return;
      }

      /* Items were added before hydration finished — merge and push. */
      const merged = mergeCarts(serverItems, localItems);
      const saved = await syncCart(merged);
      if (cancelled) return;

      const authoritative = saved ?? merged;
      confirmedRef.current = authoritative;
      dispatch({ type: 'replace', items: authoritative });
      setIsSyncing(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [remoteEnabled, customerSynced]);

  /*
  |--------------------------------------------------------------------------
  | Mutations (optimistic, with rollback)
  |--------------------------------------------------------------------------
  */

  /**
   * Run a server call behind an optimistic local change.
   *
   * @param {() => Promise<Record<number, number> | null>} call
   * @returns {Promise<void>}
   */
  const push = useCallback(
    async (call) => {
      if (!remoteEnabled) return;

      setIsSyncing(true);
      const result = await call();
      setIsSyncing(false);

      if (result === null) {
        /* Request failed — restore the last confirmed server state so
           the UI never shows a line the backend doesn't have. */
        dispatch({ type: 'replace', items: confirmedRef.current });
        return;
      }

      confirmedRef.current = result;
      dispatch({ type: 'replace', items: result });
    },
    [remoteEnabled],
  );

  const addItem = useCallback(
    (id, qty = 1) => {
      const product = productById.get(id);
      /* Guard: unavailable products can never enter the cart, even if a
         stale screen or a race slipped past the disabled UI. */
      if (product && product.available === false) return false;

      dispatch({ type: 'add', id, qty });
      push(() => addCartItem(id, qty));
      return true;
    },
    [productById, push],
  );

  const changeQty = useCallback(
    (id, delta) => {
      const next = (itemsRef.current[id] ?? 0) + delta;
      dispatch({ type: 'change', id, delta });

      if (next <= 0) {
        push(() => removeCartItem(id));
        return;
      }
      push(() => updateCartItem(id, next));
    },
    [push],
  );

  const setQty = useCallback(
    (id, qty) => {
      dispatch({ type: 'set', id, qty });
      push(() => (qty <= 0 ? removeCartItem(id) : updateCartItem(id, qty)));
    },
    [push],
  );

  const removeItem = useCallback(
    (id) => {
      dispatch({ type: 'set', id, qty: 0 });
      push(() => removeCartItem(id));
    },
    [push],
  );

  const clearCart = useCallback(() => {
    dispatch({ type: 'clear' });
    if (!remoteEnabled) return;

    (async () => {
      setIsSyncing(true);
      const ok = await clearCartRemote();
      setIsSyncing(false);
      if (ok) confirmedRef.current = {};
      else dispatch({ type: 'replace', items: confirmedRef.current });
    })();
  }, [remoteEnabled]);

  /*
  |--------------------------------------------------------------------------
  | Derived values
  |--------------------------------------------------------------------------
  */

  const value = useMemo(() => {
    const entries = Object.entries(items)
      .map(([id, qty]) => ({ product: productById.get(Number(id)), qty }))
      .filter((entry) => Boolean(entry.product));

    const count = entries.reduce((sum, e) => sum + e.qty, 0);
    const subtotal = entries.reduce((sum, e) => sum + e.product.price * e.qty, 0);

    return {
      items,
      entries,
      count,
      subtotal,
      deliveryFee,
      total: subtotal + (count > 0 ? deliveryFee : 0),
      isSyncing,
      addItem,
      changeQty,
      setQty,
      removeItem,
      clearCart,
    };
  }, [items, productById, deliveryFee, isSyncing, addItem, changeQty, setQty, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

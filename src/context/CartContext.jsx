/*
|--------------------------------------------------------------------------
| Cart Context (server-persisted, optimistic)
|--------------------------------------------------------------------------
| State is a flat array of LINES: {productId, priceOptionId, quantity}.
| `priceOptionId` is null for a plain product; a product with price
| options can have several lines sharing the same productId, one per
| selected option — they are never collapsed together. Product data and
| the delivery fee come from the catalog; lines for products no longer in
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
import { useTranslation } from 'react-i18next';
import { useCatalog } from './CatalogContext';
import { useCustomer } from './CustomerContext';
import { useToasts } from './ToastContext';
import {
  hasBackend,
  fetchCart,
  syncCart,
  clearCartRemote,
  addCartItem,
  addCartItemOptions,
  updateCartItem,
  removeCartItem,
} from '../api/client';

const CartContext = createContext(null);

/** @typedef {{productId: number, priceOptionId: number|null, quantity: number}} CartLine */

/** Stable identity for one cart line — a product line, optionally scoped to one option. */
function lineKey(productId, priceOptionId) {
  return `${productId}:${priceOptionId ?? ''}`;
}

/**
 * @param {CartLine[]} state
 * @param {{type: 'addLine'|'addLines'|'changeLineQty'|'setLineQty'|'replace'|'clear',
 *          productId?: number, priceOptionId?: number|null, qty?: number, delta?: number,
 *          lines?: Array<{priceOptionId: number|null, quantity: number}>, items?: CartLine[]}} action
 * @returns {CartLine[]}
 */
function cartReducer(state, action) {
  switch (action.type) {
    case 'addLine': {
      const key = lineKey(action.productId, action.priceOptionId ?? null);
      const idx = state.findIndex((l) => lineKey(l.productId, l.priceOptionId) === key);
      if (idx === -1) {
        return [
          ...state,
          { productId: action.productId, priceOptionId: action.priceOptionId ?? null, quantity: action.qty ?? 1 },
        ];
      }
      const next = [...state];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + (action.qty ?? 1) };
      return next;
    }
    /* One product, several selected options landing atomically. */
    case 'addLines':
      return action.lines.reduce(
        (acc, line) =>
          cartReducer(acc, {
            type: 'addLine',
            productId: action.productId,
            priceOptionId: line.priceOptionId,
            qty: line.quantity,
          }),
        state,
      );
    case 'changeLineQty': {
      const key = lineKey(action.productId, action.priceOptionId ?? null);
      const idx = state.findIndex((l) => lineKey(l.productId, l.priceOptionId) === key);
      if (idx === -1) return state;
      const nextQty = state[idx].quantity + action.delta;
      if (nextQty <= 0) return state.filter((_, i) => i !== idx);
      const next = [...state];
      next[idx] = { ...next[idx], quantity: nextQty };
      return next;
    }
    case 'setLineQty': {
      const key = lineKey(action.productId, action.priceOptionId ?? null);
      const idx = state.findIndex((l) => lineKey(l.productId, l.priceOptionId) === key);
      if (action.qty <= 0) {
        return idx === -1 ? state : state.filter((_, i) => i !== idx);
      }
      if (idx === -1) {
        return [
          ...state,
          { productId: action.productId, priceOptionId: action.priceOptionId ?? null, quantity: action.qty },
        ];
      }
      const next = [...state];
      next[idx] = { ...next[idx], quantity: action.qty };
      return next;
    }
    /* Adopt a server snapshot wholesale. */
    case 'replace':
      return [...(action.items ?? [])];
    case 'clear':
      return [];
    default:
      return state;
  }
}

/** Merge two line lists by taking the larger quantity per line (product + option). */
function mergeCarts(a, b) {
  const map = new Map(a.map((line) => [lineKey(line.productId, line.priceOptionId), line]));
  for (const line of b) {
    const key = lineKey(line.productId, line.priceOptionId);
    const existing = map.get(key);
    map.set(key, existing ? { ...existing, quantity: Math.max(existing.quantity, line.quantity) } : line);
  }
  return Array.from(map.values());
}

export function CartProvider({ children }) {
  const { t } = useTranslation();
  const { toast } = useToasts();
  const { productById, deliveryFee } = useCatalog();
  const { synced: customerSynced } = useCustomer();
  const [items, dispatch] = useReducer(cartReducer, []);
  const [isSyncing, setIsSyncing] = useState(false);

  /* Last state the server confirmed — the rollback target. */
  const confirmedRef = useRef([]);
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
      const hasLocal = localItems.length > 0;

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
   * @param {() => Promise<CartLine[] | null>} call
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
        toast(t('cart.syncFailed'), 'error');
        return;
      }

      confirmedRef.current = result;
      dispatch({ type: 'replace', items: result });
    },
    [remoteEnabled, t, toast],
  );

  /** Add a plain product (no price options) — unchanged today's behavior. */
  const addItem = useCallback(
    (id, qty = 1) => {
      const product = productById.get(id);
      /* Guard: unavailable products can never enter the cart, even if a
         stale screen or a race slipped past the disabled UI. */
      if (product && product.available === false) return false;
      /* A product with price options must go through addItemWithOptions —
         the API rejects a bare quantity for it. */
      if (product?.priceOptions?.length > 0) return false;

      dispatch({ type: 'addLine', productId: id, priceOptionId: null, qty });
      push(() => addCartItem(id, qty));
      return true;
    },
    [productById, push],
  );

  /**
   * Add every selected price option of one product in a single atomic
   * call — each option lands as its own cart line.
   *
   * @param {number} productId
   * @param {Array<{priceOptionId: number, quantity: number}>} options
   * @param {string} [notes]
   */
  const addItemWithOptions = useCallback(
    (productId, options, notes) => {
      const product = productById.get(productId);
      if (product && product.available === false) return false;

      const selected = options.filter((o) => o.quantity > 0);
      if (selected.length === 0) return false;

      dispatch({
        type: 'addLines',
        productId,
        lines: selected.map((o) => ({ priceOptionId: o.priceOptionId, quantity: o.quantity })),
      });
      push(() => addCartItemOptions(productId, selected, notes));
      return true;
    },
    [productById, push],
  );

  const changeQty = useCallback(
    (id, delta, priceOptionId = null) => {
      const current = itemsRef.current.find(
        (l) => lineKey(l.productId, l.priceOptionId) === lineKey(id, priceOptionId),
      );
      const next = (current?.quantity ?? 0) + delta;
      dispatch({ type: 'changeLineQty', productId: id, priceOptionId, delta });

      if (next <= 0) {
        push(() => removeCartItem(id, priceOptionId));
        return;
      }
      push(() => updateCartItem(id, next, priceOptionId));
    },
    [push],
  );

  const setQty = useCallback(
    (id, qty, priceOptionId = null) => {
      dispatch({ type: 'setLineQty', productId: id, priceOptionId, qty });
      push(() => (qty <= 0 ? removeCartItem(id, priceOptionId) : updateCartItem(id, qty, priceOptionId)));
    },
    [push],
  );

  const removeItem = useCallback(
    (id, priceOptionId = null) => {
      dispatch({ type: 'setLineQty', productId: id, priceOptionId, qty: 0 });
      push(() => removeCartItem(id, priceOptionId));
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
      if (ok) confirmedRef.current = [];
      else {
        dispatch({ type: 'replace', items: confirmedRef.current });
        toast(t('cart.syncFailed'), 'error');
      }
    })();
  }, [remoteEnabled, t, toast]);

  /*
  |--------------------------------------------------------------------------
  | Derived values
  |--------------------------------------------------------------------------
  */

  const value = useMemo(() => {
    /* One entry per cart line: a plain product line carries priceOption
       null, matching today's rendering; a variant line carries the
       option looked up from the product's own priceOptions. */
    const entries = items
      .map((line) => {
        const product = productById.get(line.productId);
        if (!product) return null;
        const priceOption = line.priceOptionId != null
          ? product.priceOptions?.find((o) => o.id === line.priceOptionId) ?? null
          : null;
        return {
          key: lineKey(line.productId, line.priceOptionId),
          product,
          priceOption,
          qty: line.quantity,
        };
      })
      .filter(Boolean);

    /* Lines sharing a product are grouped for cart display — one card,
       each selected option (or the single plain line) as its own row. */
    const groupsById = new Map();
    for (const entry of entries) {
      const group = groupsById.get(entry.product.id) ?? { product: entry.product, lines: [] };
      group.lines.push(entry);
      groupsById.set(entry.product.id, group);
    }
    const groupedEntries = Array.from(groupsById.values());

    const unitPrice = (entry) => (entry.priceOption ? entry.priceOption.finalPrice : entry.product.price);
    const count = entries.reduce((sum, e) => sum + e.qty, 0);
    const subtotal = entries.reduce((sum, e) => sum + unitPrice(e) * e.qty, 0);

    return {
      items,
      entries,
      groupedEntries,
      count,
      subtotal,
      deliveryFee,
      total: subtotal + (count > 0 ? deliveryFee : 0),
      isSyncing,
      addItem,
      addItemWithOptions,
      changeQty,
      setQty,
      removeItem,
      clearCart,
    };
  }, [
    items,
    productById,
    deliveryFee,
    isSyncing,
    addItem,
    addItemWithOptions,
    changeQty,
    setQty,
    removeItem,
    clearCart,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

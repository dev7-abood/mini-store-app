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
| in memory for the session (prices then stay blank; see below).
|
| MONEY — SERVER ONLY:
|   The backend is the single pricing authority. Every currency figure in
|   the cart (each line's total, the subtotal, the discount, the delivery
|   fee and the grand total) is stored exactly as the server sent it,
|   already rounded to 2 decimals. This file does NO currency arithmetic.
|   • A quantity tap updates the quantity instantly, but the amounts keep
|     showing the last server-confirmed figures until the response lands —
|     never a locally multiplied one.
|   • A brand-new line has no total yet, so it renders none.
|   • A mutation response without a `summary` triggers a cart re-fetch,
|     because asking the server is the only legal way to re-price.
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

/** @typedef {{productId: number, priceOptionId: number|null, quantity: number,
 *              lineTotal: number|null}} CartLine — `lineTotal` is the server's
 *   own `line_total` for the line, or null until it has priced it. */

/** @typedef {{subtotal: number|null, discountTotal: number|null,
 *             deliveryFee: number|null, total: number|null}} CartSummary */

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
          {
            productId: action.productId,
            priceOptionId: action.priceOptionId ?? null,
            quantity: action.qty ?? 1,
            /* Unpriced until the server answers — the row shows no
               amount rather than a locally computed one. */
            lineTotal: null,
          },
        ];
      }
      const next = [...state];
      /* Quantity moves now, money doesn't: keep the last confirmed
         lineTotal until the server sends the new one. */
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
          {
            productId: action.productId,
            priceOptionId: action.priceOptionId ?? null,
            quantity: action.qty,
            lineTotal: null,
          },
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
  const { productById, deliveryFee: catalogDeliveryFee } = useCatalog();
  const { synced: customerSynced } = useCustomer();
  const [items, dispatch] = useReducer(cartReducer, []);
  const [isSyncing, setIsSyncing] = useState(false);
  /* The server's pricing for the current cart. null = not priced yet;
     the UI then shows no amount rather than computing one.
     @type {[CartSummary|null, Function]} */
  const [summary, setSummary] = useState(null);

  /* Last state the server confirmed — the rollback target. */
  const confirmedRef = useRef([]);
  const confirmedSummaryRef = useRef(null);
  /* Bumped by every mutation so a slow response (or the re-price fetch
     behind it) can tell it has been overtaken and must not write. */
  const pushSeqRef = useRef(0);
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

  /**
   * Take a server snapshot as the new truth: its lines AND its pricing.
   * A snapshot without a summary leaves the last one in place (the
   * caller re-fetches to refresh it); an empty cart has no pricing at
   * all, so the stale figures are dropped.
   *
   * @param {{lines: CartLine[], summary: CartSummary|null}} snapshot
   */
  const adopt = useCallback((snapshot) => {
    const lines = snapshot?.lines ?? [];
    confirmedRef.current = lines;
    dispatch({ type: 'replace', items: lines });

    if (lines.length === 0) {
      confirmedSummaryRef.current = null;
      setSummary(null);
      return;
    }
    if (snapshot?.summary) {
      confirmedSummaryRef.current = snapshot.summary;
      setSummary(snapshot.summary);
    }
  }, []);

  useEffect(() => {
    if (!remoteEnabled || !customerSynced) return;

    let cancelled = false;

    (async () => {
      setIsSyncing(true);
      const server = await fetchCart();
      if (cancelled || server === null) {
        setIsSyncing(false);
        return;
      }

      const localItems = itemsRef.current;
      const hasLocal = localItems.length > 0;

      if (!hasLocal) {
        adopt(server);
        setIsSyncing(false);
        return;
      }

      /* Items were added before hydration finished — merge and push. */
      const merged = mergeCarts(server.lines, localItems);
      const saved = await syncCart(merged);
      if (cancelled) return;

      adopt(saved ?? { lines: merged, summary: null });
      setIsSyncing(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [adopt, remoteEnabled, customerSynced]);

  /*
  |--------------------------------------------------------------------------
  | Mutations (optimistic, with rollback)
  |--------------------------------------------------------------------------
  */

  /**
   * Run a server call behind an optimistic local change.
   *
   * @param {() => Promise<{lines: CartLine[], summary: CartSummary|null} | null>} call
   * @returns {Promise<void>}
   */
  const push = useCallback(
    async (call) => {
      if (!remoteEnabled) return;

      const seq = ++pushSeqRef.current;
      /* A response that lost the race must not write: the tap after it
         already owns the cart. */
      const isLatest = () => pushSeqRef.current === seq;

      setIsSyncing(true);
      const result = await call();

      if (result === null) {
        /* Request failed — restore the last confirmed server state, and
           with it the last confirmed prices, so the UI never shows a
           line (or an amount) the backend doesn't have. */
        if (isLatest()) {
          dispatch({ type: 'replace', items: confirmedRef.current });
          setSummary(confirmedSummaryRef.current);
          setIsSyncing(false);
        }
        toast(t('cart.syncFailed'), 'error');
        return;
      }

      if (!isLatest()) return;
      adopt(result);

      /* The mutation answered with items but no pricing: re-read the
         cart so the totals catch up. Re-pricing locally is never an
         option — the backend owns every currency figure. */
      if (!result.summary && result.lines.length > 0) {
        const repriced = await fetchCart();
        if (!isLatest()) return;
        if (repriced) adopt(repriced);
      }

      setIsSyncing(false);
    },
    [adopt, remoteEnabled, t, toast],
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
    /* An empty cart has no pricing — drop it rather than leave stale
       totals on screen, and invalidate any request still in flight so
       it can't resurrect the lines (or their amounts). */
    setSummary(null);
    pushSeqRef.current += 1;
    if (!remoteEnabled) return;

    (async () => {
      setIsSyncing(true);
      const ok = await clearCartRemote();
      setIsSyncing(false);
      if (ok) {
        confirmedRef.current = [];
        confirmedSummaryRef.current = null;
      } else {
        dispatch({ type: 'replace', items: confirmedRef.current });
        setSummary(confirmedSummaryRef.current);
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
          /* The server's `line_total` for this line — null while it is
             still unpriced (a fresh line, or a quantity change the
             backend hasn't answered yet). Never computed here. */
          lineTotal: line.lineTotal ?? null,
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

    /* Quantities are the only thing summed here — never money. */
    const count = entries.reduce((sum, e) => sum + e.qty, 0);

    return {
      items,
      entries,
      groupedEntries,
      count,
      /* Every figure below is the server's, verbatim; null means "not
         priced yet" and the screens omit it instead of showing 0. */
      subtotal: summary?.subtotal ?? null,
      discountTotal: summary?.discountTotal ?? null,
      /* The cart's own delivery fee wins; the catalog's `meta.delivery_fee`
         is the fallback — also a server figure, never a computed one. */
      deliveryFee: summary?.deliveryFee ?? catalogDeliveryFee ?? null,
      total: summary?.total ?? null,
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
    summary,
    catalogDeliveryFee,
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

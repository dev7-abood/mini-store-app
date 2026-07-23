/*
|--------------------------------------------------------------------------
| Cart Context
|--------------------------------------------------------------------------
| Cart state lives in a reducer keyed by product id -> quantity. Product
| data and the delivery fee come from the (dynamic) catalog; entries for
| products that no longer exist in the catalog are ignored gracefully.
*/
import { createContext, useContext, useMemo, useReducer } from 'react';
import { useCatalog } from './CatalogContext';

const CartContext = createContext(null);

/** @typedef {Record<number, number>} CartState  product id -> quantity */

/**
 * @param {CartState} state
 * @param {{type: 'add'|'change'|'clear', id?: number, qty?: number, delta?: number}} action
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
    case 'clear':
      return {};
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const { productById, deliveryFee } = useCatalog();
  const [items, dispatch] = useReducer(cartReducer, {});

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
      /* Guard: unavailable products can never enter the cart, even if a
         stale screen or a race slipped past the disabled UI. */
      addItem: (id, qty = 1) => {
        const product = productById.get(id);
        if (product && product.available === false) return false;
        dispatch({ type: 'add', id, qty });
        return true;
      },
      changeQty: (id, delta) => dispatch({ type: 'change', id, delta }),
      clearCart: () => dispatch({ type: 'clear' }),
    };
  }, [items, productById, deliveryFee]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

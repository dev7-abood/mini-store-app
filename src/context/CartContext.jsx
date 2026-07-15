/*
|--------------------------------------------------------------------------
| Cart Context
|--------------------------------------------------------------------------
| Cart state lives in a reducer keyed by product id -> quantity. Totals
| are derived with useMemo so components only re-render on real changes.
*/
import { createContext, useContext, useMemo, useReducer } from 'react';
import { DELIVERY_FEE, PRODUCT_BY_ID } from '../data/menu';

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
  const [items, dispatch] = useReducer(cartReducer, {});

  const value = useMemo(() => {
    const entries = Object.entries(items).map(([id, qty]) => ({
      product: PRODUCT_BY_ID.get(Number(id)),
      qty,
    }));

    const count = entries.reduce((sum, e) => sum + e.qty, 0);
    const subtotal = entries.reduce((sum, e) => sum + e.product.price * e.qty, 0);

    return {
      items,
      entries,
      count,
      subtotal,
      deliveryFee: DELIVERY_FEE,
      total: subtotal + (count > 0 ? DELIVERY_FEE : 0),
      addItem: (id, qty = 1) => dispatch({ type: 'add', id, qty }),
      changeQty: (id, delta) => dispatch({ type: 'change', id, delta }),
      clearCart: () => dispatch({ type: 'clear' }),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** @returns {ReturnType<typeof CartProvider> extends never ? never : any} */
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

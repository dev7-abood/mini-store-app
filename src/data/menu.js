/*
|--------------------------------------------------------------------------
| Menu Catalog (Static Seed)
|--------------------------------------------------------------------------
| Names/descriptions live in the i18n files (keyed by category id / product
| id) so the catalog stays language-agnostic. When you wire the Laravel
| backend, replace this module's exports with the payload of
| `fetchCatalog()` from `src/api/client.js` — the shape is identical.
*/

/** Build an Unsplash CDN URL for a photo id. */
const unsplash = (id) =>
  `https://images.unsplash.com/${id}?w=500&q=80&auto=format&fit=crop`;

export const DELIVERY_FEE = 10;

/**
 * @typedef {Object} Category
 * @property {string} id       Stable id, also the i18n key under `categories.*`
 * @property {string} fallback Emoji shown while / if the photo fails
 * @property {string} tint     Background tint behind the photo
 * @property {string} image    Photo URL
 */

/** @type {Category[]} */
export const CATEGORIES = [
  { id: 'burgers', fallback: '🍔', tint: '#FBE3C9', image: unsplash('photo-1568901346375-23c9450c58cd') },
  { id: 'pizza', fallback: '🍕', tint: '#FADFD5', image: unsplash('photo-1513104890138-7c749659a591') },
  { id: 'shawarma', fallback: '🌯', tint: '#F0E6CF', image: unsplash('photo-1529006557810-274b9b2fc783') },
  { id: 'sides', fallback: '🍟', tint: '#FBF0C9', image: unsplash('photo-1573080496219-bb080dd4f877') },
  { id: 'drinks', fallback: '🥤', tint: '#D9EDE0', image: unsplash('photo-1497534446932-c925b458314e') },
  { id: 'desserts', fallback: '🍰', tint: '#F6DDE7', image: unsplash('photo-1578985545062-69928b1d9587') },
];

/**
 * @typedef {Object} Product
 * @property {number} id       Stable id, also the i18n key under `products.*`
 * @property {string} category Category id
 * @property {string} fallback Emoji fallback
 * @property {number} price    Price in ILS
 * @property {string} image    Photo URL
 */

/** @type {Product[]} */
export const PRODUCTS = [
  { id: 1, category: 'burgers', fallback: '🍔', price: 32, image: unsplash('photo-1568901346375-23c9450c58cd') },
  { id: 2, category: 'burgers', fallback: '🍗', price: 28, image: unsplash('photo-1606755962773-d324e0a13086') },
  { id: 3, category: 'burgers', fallback: '🥩', price: 36, image: unsplash('photo-1553979459-d2229ba7433b') },
  { id: 4, category: 'pizza', fallback: '🍕', price: 38, image: unsplash('photo-1574071318508-1cdbab80d002') },
  { id: 5, category: 'pizza', fallback: '🧀', price: 44, image: unsplash('photo-1513104890138-7c749659a591') },
  { id: 6, category: 'pizza', fallback: '🍄', price: 42, image: unsplash('photo-1571407970349-bc81e7e96d47') },
  { id: 7, category: 'shawarma', fallback: '🌯', price: 22, image: unsplash('photo-1529006557810-274b9b2fc783') },
  { id: 8, category: 'shawarma', fallback: '🥙', price: 26, image: unsplash('photo-1544025162-d76694265947') },
  { id: 9, category: 'sides', fallback: '🍟', price: 12, image: unsplash('photo-1573080496219-bb080dd4f877') },
  { id: 10, category: 'sides', fallback: '🥗', price: 16, image: unsplash('photo-1512621776951-a57141f2eefd') },
  { id: 11, category: 'drinks', fallback: '🥤', price: 8, image: unsplash('photo-1554866585-cd94860890b7') },
  { id: 12, category: 'drinks', fallback: '🍋', price: 12, image: unsplash('photo-1497534446932-c925b458314e') },
  { id: 13, category: 'desserts', fallback: '🍰', price: 18, image: unsplash('photo-1533134242443-d4fd215305ad') },
  { id: 14, category: 'desserts', fallback: '🍫', price: 16, image: unsplash('photo-1606313564200-e75d5e30476c') },
];

/** Quick lookup maps. */
export const PRODUCT_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));
export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

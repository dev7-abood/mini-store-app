/*
|--------------------------------------------------------------------------
| Fallback Catalog Seed
|--------------------------------------------------------------------------
| Used only when VITE_API_BASE_URL is not set or the catalog request
| fails — the live catalog comes from the Laravel API via fetchCatalog()
| (see the contract in README.md). Same normalized shape as the API.
*/

const unsplash = (id) =>
  `https://images.unsplash.com/${id}?w=500&q=80&auto=format&fit=crop`;

export const FALLBACK_DELIVERY_FEE = 10;

/** @typedef {{id: string, name: string, fallback: string, tint: string, image: string}} Category */
/** @typedef {{id: number, category: string, name: string, desc: string, price: number, fallback: string, image: string}} Product */

/** @type {Category[]} */
export const FALLBACK_CATEGORIES = [
  { id: 'burgers', name: 'برجر', fallback: '🍔', tint: '#FBE3C9', image: unsplash('photo-1568901346375-23c9450c58cd') },
  { id: 'pizza', name: 'بيتزا', fallback: '🍕', tint: '#FADFD5', image: unsplash('photo-1513104890138-7c749659a591') },
  { id: 'shawarma', name: 'شاورما', fallback: '🌯', tint: '#F0E6CF', image: unsplash('photo-1529006557810-274b9b2fc783') },
  { id: 'sides', name: 'مقبلات', fallback: '🍟', tint: '#FBF0C9', image: unsplash('photo-1573080496219-bb080dd4f877') },
  { id: 'drinks', name: 'مشروبات', fallback: '🥤', tint: '#D9EDE0', image: unsplash('photo-1497534446932-c925b458314e') },
  { id: 'desserts', name: 'حلويات', fallback: '🍰', tint: '#F6DDE7', image: unsplash('photo-1578985545062-69928b1d9587') },
];

/** @type {Product[]} */
export const FALLBACK_PRODUCTS = [
  { id: 1, category: 'burgers', name: 'سماش كلاسيك', desc: 'لحم سماش دبل مع شيدر وصوص البيت', price: 32, fallback: '🍔', image: unsplash('photo-1568901346375-23c9450c58cd') },
  { id: 2, category: 'burgers', name: 'دجاج مقرمش', desc: 'دجاج مقلي مقرمش مع سلطة ومايونيز حار', price: 28, fallback: '🍗', image: unsplash('photo-1606755962773-d324e0a13086') },
  { id: 3, category: 'burgers', name: 'باربكيو مدخن', desc: 'قرص لحم مع صوص باربكيو وحلقات بصل', price: 36, fallback: '🥩', image: unsplash('photo-1553979459-d2229ba7433b') },
  { id: 4, category: 'pizza', name: 'مارجريتا', desc: 'صلصة طماطم، موزاريلا، ريحان طازج', price: 38, fallback: '🍕', image: unsplash('photo-1574071318508-1cdbab80d002') },
  { id: 5, category: 'pizza', name: 'أربع أجبان', desc: 'موزاريلا، جودة، بارميزان، جبنة زرقاء', price: 44, fallback: '🧀', image: unsplash('photo-1513104890138-7c749659a591') },
  { id: 6, category: 'pizza', name: 'فطر بالكمأة', desc: 'فطر بري مع زيت الكمأة والزعتر', price: 42, fallback: '🍄', image: unsplash('photo-1571407970349-bc81e7e96d47') },
  { id: 7, category: 'shawarma', name: 'شاورما دجاج', desc: 'دجاج متبل مع ثومية ومخلل', price: 22, fallback: '🌯', image: unsplash('photo-1529006557810-274b9b2fc783') },
  { id: 8, category: 'shawarma', name: 'صحن شاورما لحم', desc: 'شاورما لحم مع أرز وطحينة وسلطة', price: 26, fallback: '🥙', image: unsplash('photo-1544025162-d76694265947') },
  { id: 9, category: 'sides', name: 'بطاطا ذهبية', desc: 'بطاطا مقرمشة مع بهاراتنا السرية', price: 12, fallback: '🍟', image: unsplash('photo-1573080496219-bb080dd4f877') },
  { id: 10, category: 'sides', name: 'فتوش', desc: 'خضار طازجة مع سماق وخبز محمص', price: 16, fallback: '🥗', image: unsplash('photo-1512621776951-a57141f2eefd') },
  { id: 11, category: 'drinks', name: 'مشروب غازي', desc: 'كولا، ليمون أو برتقال', price: 8, fallback: '🥤', image: unsplash('photo-1554866585-cd94860890b7') },
  { id: 12, category: 'drinks', name: 'ليمون بالنعنع', desc: 'ليمون طازج مع نعنع مطحون', price: 12, fallback: '🍋', image: unsplash('photo-1497534446932-c925b458314e') },
  { id: 13, category: 'desserts', name: 'تشيز كيك كنافة', desc: 'تشيز كيك كريمي مع طبقة كنافة', price: 18, fallback: '🍰', image: unsplash('photo-1533134242443-d4fd215305ad') },
  { id: 14, category: 'desserts', name: 'براوني سايح', desc: 'براوني دافئ بقلب شوكولاتة سايح', price: 16, fallback: '🍫', image: unsplash('photo-1606313564200-e75d5e30476c') },
];

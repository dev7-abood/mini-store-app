/*
|--------------------------------------------------------------------------
| Product Search
|--------------------------------------------------------------------------
| Arabic-aware fuzzy matching. Typing on a phone keyboard rarely matches
| stored text exactly, so before comparing we normalize away the
| differences that shouldn't matter:
|
|   • tashkeel / diacritics   شَاوَرْما  ->  شاورما
|   • alef forms              أ إ آ ٱ    ->  ا
|   • ta marbuta / ha         ة          ->  ه
|   • alef maqsura / ya       ى          ->  ي
|   • hamza carriers          ؤ ئ        ->  و ي
|   • tatweel                 شــاورما   ->  شاورما
|   • Arabic-Indic digits     ٥          ->  5
|   • case + extra whitespace (Latin names like "Pizza")
|
| Results are RANKED, not just filtered: an exact name match beats a
| prefix, which beats a substring, which beats a description hit — so
| "برجر" surfaces «برجر كلاسيك» above «صلصة برجر».
*/

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

/** Arabic-Indic and Eastern Arabic-Indic digits -> ASCII. */
const DIGIT_MAP = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/**
 * Fold a string into its comparable form.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeText(value) {
  if (!value) return '';

  /* Order matters: fold the letters FIRST, then strip marks. NFKD
     would decompose ة into ه + a combining mark, so a later ة -> ه
     rule would never fire. */
  return String(value)
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627') // أ إ آ ٱ -> ا
    .replace(/\u0629/g, '\u0647')                     // ة -> ه
    .replace(/\u0649/g, '\u064A')                     // ى -> ي
    .replace(/\u0624/g, '\u0648')                     // ؤ -> و
    .replace(/\u0626/g, '\u064A')                     // ئ -> ي
    .replace(TASHKEEL, '')      // diacritics carry no search meaning
    .replace(TATWEEL, '')
    .replace(/[٠-٩۰-۹]/g, (d) => DIGIT_MAP[d] ?? d)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minimum characters before searching (1 char matches nearly everything). */
export const MIN_QUERY_LENGTH = 2;

/* Ranking weights — higher wins. */
const SCORE_EXACT = 100;
const SCORE_PREFIX = 60;
const SCORE_WORD_PREFIX = 40;
const SCORE_SUBSTRING = 25;
const SCORE_DESCRIPTION = 10;
const SCORE_FUZZY = 5;

/** Below this length a single edit distorts the query too much. */
const FUZZY_MIN_LENGTH = 4;

/**
 * Score one product against a normalized query.
 *
 * @param {{name: string, desc: string}} product
 * @param {string} query  already normalized
 * @returns {number} 0 = no match
 */
function scoreProduct(product, query) {
  const name = normalizeText(product.name);
  const desc = normalizeText(product.desc);

  if (name === query) return SCORE_EXACT;
  if (name.startsWith(query)) return SCORE_PREFIX;

  /* Match at the start of any word: "كلاسيك" finds «برجر كلاسيك». */
  if (name.split(' ').some((word) => word.startsWith(query))) return SCORE_WORD_PREFIX;

  if (name.includes(query)) return SCORE_SUBSTRING;
  if (desc.includes(query)) return SCORE_DESCRIPTION;

  /* Typo tolerance, last resort: allow ONE edit against any word in the
     name. This is what makes «شاورمه» find «شاورما» — colloquial Arabic
     ends the same word in ا or ة/ه — and forgives a slipped key. Only
     applied to queries long enough that one edit isn't most of the
     word, so short queries stay precise. */
  if (query.length >= FUZZY_MIN_LENGTH) {
    const words = name.split(' ');
    if (words.some((word) => withinOneEdit(word, query))) return SCORE_FUZZY;
  }

  return 0;
}

/**
 * Whether two strings are within a single insert / delete / substitute.
 * Cheaper and clearer than a full Levenshtein matrix for a 1-edit check.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function withinOneEdit(a, b) {
  if (a === b) return true;

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;

  let i = 0;
  let j = 0;
  let edited = false;

  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (edited) return false;
    edited = true;

    /* Same length -> substitution; different -> deletion from `long`. */
    if (short.length === long.length) i += 1;
    j += 1;
  }

  return true;
}

/**
 * Search products, ranked by relevance.
 *
 * Multi-word queries require EVERY token to match somewhere (AND), so
 * "برجر دجاج" narrows rather than widens.
 *
 * @param {Array<{id: number, name: string, desc: string}>} products
 * @param {string} rawQuery
 * @returns {Array<object>|null} null when the query is too short to search
 */
export function searchProducts(products, rawQuery) {
  const query = normalizeText(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) return null;

  const tokens = query.split(' ').filter(Boolean);

  return products
    .map((product, index) => {
      /* Every token must hit; the best single-token score ranks it. */
      let best = 0;
      for (const token of tokens) {
        const score = scoreProduct(product, token);
        if (score === 0) return { product, index, score: 0 };
        best = Math.max(best, score);
      }
      return { product, index, score: best };
    })
    .filter((entry) => entry.score > 0)
    /* Ties keep catalog order (the merchant's sort_order), which is
       more meaningful than alphabetical. */
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.product);
}

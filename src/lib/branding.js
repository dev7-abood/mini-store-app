/*
|--------------------------------------------------------------------------
| Branding
|--------------------------------------------------------------------------
| Default theme (the سفرة palette) plus a helper that writes a branding
| object onto the app's CSS custom properties, so the whole UI re-themes
| from one place. Colors map to the tokens defined in global.css.
*/

/** @typedef {{name: string, tagline: string, primary_color: string,
 *   secondary_color: string, background_color: string, text_color: string,
 *   logo_url: string|null, logo_size: number}} Branding */

/** @type {Branding} */
export const DEFAULT_BRANDING = {
  name: 'سفرة',
  tagline: 'أكل طازة يوصلك بسرعة',
  primary_color: '#1E4D2B',
  secondary_color: '#F2A93B',
  background_color: '#F7F2EA',
  text_color: '#22180E',
  logo_url: null,
  logo_size: 64,
};

/**
 * Merge a partial branding payload over the defaults (any missing or
 * empty field falls back), so a half-configured tenant never breaks.
 *
 * @param {Partial<Branding>|null} incoming
 * @returns {Branding}
 */
export function normalizeBranding(incoming) {
  if (!incoming) return DEFAULT_BRANDING;
  const merged = { ...DEFAULT_BRANDING };
  for (const key of Object.keys(DEFAULT_BRANDING)) {
    const value = incoming[key];
    if (value !== undefined && value !== null && value !== '') merged[key] = value;
  }
  return merged;
}

/**
 * Write branding colors onto the document's CSS variables. The token
 * names match global.css (--basil primary, --saffron secondary,
 * --bg background, --ink text) plus their deep/derived shades.
 *
 * @param {Branding} branding
 */
export function applyBranding(branding) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;

  root.setProperty('--basil', branding.primary_color);
  root.setProperty('--basil-deep', shade(branding.primary_color, -0.18));
  root.setProperty('--saffron', branding.secondary_color);
  root.setProperty('--bg', branding.background_color);
  root.setProperty('--ink', branding.text_color);
}

/**
 * Darken (t<0) or lighten (t>0) a hex color by a ratio. Used to derive
 * the deep basil shade for gradients from the tenant's primary color.
 *
 * @param {string} hex e.g. '#1E4D2B'
 * @param {number} t  -1..1
 * @returns {string}
 */
function shade(hex, t) {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return hex;
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  const adj = (c) => {
    const v = t < 0 ? c * (1 + t) : c + (255 - c) * t;
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `#${[adj(r), adj(g), adj(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

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
 * Strip null / undefined / empty values so a layer only contributes the
 * keys it actually defines.
 *
 * @param {object|null|undefined} source
 * @returns {object}
 */
function definedOnly(source) {
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}

/**
 * Merge a single partial payload over the built-in defaults.
 *
 * @param {Partial<Branding>|null} incoming
 * @returns {Branding}
 */
export function normalizeBranding(incoming) {
  return { ...DEFAULT_BRANDING, ...definedOnly(incoming) };
}

/**
 * Resolve the final branding from all three layers.
 *
 * PRECEDENCE (highest last — later spreads overwrite earlier ones):
 *   1. DEFAULT_BRANDING — neutral built-in fallback
 *   2. registry theme   — tenants.json, the per-tenant default shipped
 *                         with the app; used when the DB has nothing
 *   3. API payload      — what the merchant actually configured in the
 *                         admin panel. Wins for every key it defines.
 *
 * The API returns null for keys the tenant never configured, and
 * definedOnly() drops those — so an unconfigured field falls through to
 * the registry rather than overwriting it with a null.
 *
 * @param {{registryTheme?: object|null, apiPayload?: object|null}} layers
 * @returns {Branding}
 */
export function resolveBranding({ registryTheme = null, apiPayload = null } = {}) {
  return {
    ...DEFAULT_BRANDING,
    ...definedOnly(registryTheme),
    ...definedOnly(apiPayload),
  };
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

  /* Card/sheet surface derived from the tenant background, always
     OPAQUE — these surfaces sit over content and must never let it
     bleed through. Light themes lift toward white; dark themes lift
     only slightly so the surface stays dark enough for light text. */
  root.setProperty('--card', surfaceFrom(branding.background_color));
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

/**
 * Perceived luminance of a hex color (0-255).
 *
 * @param {string} hex
 * @returns {number}
 */
function luminance(hex) {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return 255;
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/**
 * Opaque card/sheet surface for a given background. Light backgrounds
 * lift strongly toward white; dark backgrounds lift just enough to read
 * as a raised surface without washing out to grey.
 *
 * @param {string} background
 * @returns {string}
 */
function surfaceFrom(background) {
  return luminance(background) < 128
    ? shade(background, 0.12)
    : shade(background, 0.72);
}

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
  /* Splash behaviour, mirroring the API's `splash` object. */
  splash: {
    enabled: true,
    duration: 900, // ms the splash stays up at minimum
  },
};

/**
 * Strip null / undefined / empty values so a layer only contributes the
 * keys it actually defines.
 *
 * Recurses into plain objects: the API sends `splash: {enabled: null,
 * duration: null}` for an unconfigured branch, and a shallow filter
 * would keep that object (it isn't null) and wipe the defaults beneath
 * it. Nested objects that end up empty are dropped entirely.
 *
 * @param {object|null|undefined} source
 * @returns {object}
 */
function definedOnly(source) {
  if (!source || typeof source !== 'object') return {};

  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === '') continue;

    if (isPlainObject(value)) {
      const nested = definedOnly(value);
      if (Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge layers, recursing one level so nested groups (splash) merge
 * key-by-key instead of replacing each other wholesale.
 *
 * @param {...object} layers
 * @returns {object}
 */
function deepMerge(...layers) {
  const result = {};

  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      result[key] = isPlainObject(value) && isPlainObject(result[key])
        ? { ...result[key], ...value }
        : value;
    }
  }
  return result;
}

/**
 * Merge a single partial payload over the built-in defaults.
 *
 * @param {Partial<Branding>|null} incoming
 * @returns {Branding}
 */
export function normalizeBranding(incoming) {
  return deepMerge(DEFAULT_BRANDING, definedOnly(incoming));
}

/**
 * Resolve branding from layered inputs.
 *
 * The startup flow no longer merges registry theme into successful API
 * responses. TenantProvider chooses either API config or registry
 * fallback first, then normalizes the selected source.
 *
 * @param {{registryTheme?: object|null, apiPayload?: object|null}} layers
 * @returns {Branding}
 */
export function resolveBranding({ registryTheme = null, apiPayload = null } = {}) {
  return deepMerge(
    DEFAULT_BRANDING,
    definedOnly(registryTheme),
    definedOnly(apiPayload),
  );
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

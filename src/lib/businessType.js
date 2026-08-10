/*
|--------------------------------------------------------------------------
| Business Type Configuration
|--------------------------------------------------------------------------
| Tenants can opt into one of the supported storefront modes. Everything
| business-specific lives here so components consume one stable shape
| instead of growing conditional branches.
*/

/** @typedef {'store' | 'restaurant'} BusinessType */
/** @typedef {'store' | 'restaurant'} SkeletonVariant */
/** @typedef {'category' | 'product'} PlaceholderKind */
/**
 * @typedef {{
 *   cart: string,
 *   catalogEmpty: string,
 *   loading: string,
 *   searchEmpty: string,
 * }} BusinessStateIcons
 */
/**
 * @typedef {{
 *   category: readonly string[],
 *   product: readonly string[],
 * }} BusinessPlaceholderIcons
 */
/**
 * @typedef {{
 *   defaultItems: number,
 *   nextPageItems: number,
 *   variant: SkeletonVariant,
 * }} BusinessSkeletonConfig
 */
/**
 * @typedef {{
 *   businessType: BusinessType,
 *   icons: BusinessStateIcons,
 *   placeholders: BusinessPlaceholderIcons,
 *   skeleton: BusinessSkeletonConfig,
 * }} BusinessTypeConfig
 */

/** @type {BusinessType} */
export const DEFAULT_BUSINESS_TYPE = 'store';

/** @type {readonly BusinessType[]} */
export const SUPPORTED_BUSINESS_TYPES = Object.freeze(['store', 'restaurant']);

const SUPPORTED_BUSINESS_TYPE_SET = new Set(SUPPORTED_BUSINESS_TYPES);

/** @type {Record<BusinessType, BusinessTypeConfig>} */
export const businessTypeConfig = Object.freeze({
  store: Object.freeze({
    businessType: 'store',
    icons: Object.freeze({
      cart: '\u{1F6D2}',
      catalogEmpty: '\u{1F4E6}',
      loading: '\u{1F6CD}\uFE0F',
      searchEmpty: '\u{1F50E}',
    }),
    placeholders: Object.freeze({
      category: Object.freeze([
        '\u{1F6CD}\uFE0F',
        '\u{1F3F7}\uFE0F',
        '\u{1F4F1}',
        '\u{1F381}',
        '\u{1F9F4}',
        '\u{1F4DA}',
      ]),
      product: Object.freeze([
        '\u{1F4E6}',
        '\u{1F6CD}\uFE0F',
        '\u{1F3F7}\uFE0F',
        '\u{1F381}',
        '\u{2B50}',
        '\u{1F4B3}',
      ]),
    }),
    skeleton: Object.freeze({
      defaultItems: 6,
      nextPageItems: 2,
      variant: 'store',
    }),
  }),
  restaurant: Object.freeze({
    businessType: 'restaurant',
    icons: Object.freeze({
      cart: '\u{1F9FA}',
      catalogEmpty: '\u{1F37D}\uFE0F',
      loading: '\u{1F37D}\uFE0F',
      searchEmpty: '\u{1F374}',
    }),
    placeholders: Object.freeze({
      category: Object.freeze([
        '\u{1F37D}\uFE0F',
        '\u{1F35B}',
        '\u{1F957}',
        '\u{1F354}',
        '\u{1F370}',
        '\u{2615}',
      ]),
      product: Object.freeze([
        '\u{1F37D}\uFE0F',
        '\u{1F35B}',
        '\u{1F957}',
        '\u{1F35C}',
        '\u{1F95E}',
        '\u{1F964}',
      ]),
    }),
    skeleton: Object.freeze({
      defaultItems: 6,
      nextPageItems: 2,
      variant: 'restaurant',
    }),
  }),
});

/**
 * @param {unknown} value
 * @returns {BusinessType}
 */
export function normalizeBusinessType(value) {
  const candidate = String(value ?? '').trim().toLowerCase();
  return SUPPORTED_BUSINESS_TYPE_SET.has(candidate)
    ? /** @type {BusinessType} */ (candidate)
    : DEFAULT_BUSINESS_TYPE;
}

/**
 * @param {unknown} value
 * @returns {BusinessTypeConfig}
 */
export function getBusinessTypeConfig(value) {
  return businessTypeConfig[normalizeBusinessType(value)];
}

/**
 * Rotate through configured fallback icons for catalog/product photos.
 *
 * @param {unknown} businessType
 * @param {PlaceholderKind} kind
 * @param {number} [index]
 * @returns {string}
 */
export function pickPlaceholderIcon(businessType, kind, index = 0) {
  const icons = getBusinessTypeConfig(businessType).placeholders[kind];
  return icons[Math.abs(index) % icons.length];
}

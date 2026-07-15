/*
|--------------------------------------------------------------------------
| i18n Bootstrap
|--------------------------------------------------------------------------
| Arabic-only for now, but wired through react-i18next so adding English
| later is just: import en.json + add it to `resources` + flip `lng`.
| Direction is also derived from here so <html dir> stays in sync.
*/
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar.json";

export const DEFAULT_LOCALE = "ar";

/** @type {Record<string, "rtl" | "ltr">} */
const DIRECTIONS = { ar: "rtl" };

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: {
    // React already escapes output
    escapeValue: false,
  },
});

/** Keep the document element in sync with the active locale. */
export function applyDocumentLocale(locale = i18n.language) {
  document.documentElement.lang = locale;
  document.documentElement.dir = DIRECTIONS[locale] ?? "rtl";
}

export default i18n;

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./de.json";
import en from "./en.json";
import fr from "./fr.json";

// v0.1 UI languages (§1); each is named in its own language in the switcher.
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "bj.lang";

function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.some((l) => l.code === value);
}

/** The saved choice, else the first browser language we support, else English (§6). */
function detectLanguage(): Language {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode); fall back to the browser languages.
  }
  if (isLanguage(saved)) return saved;
  const browser = navigator.languages.map((tag) =>
    tag.slice(0, 2).toLowerCase(),
  );
  return browser.find(isLanguage) ?? "en";
}

/** Switches the UI language and remembers it on this device. */
export function setLanguage(language: Language) {
  void i18n.changeLanguage(language);
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not remembered, but the switch still applies for this visit.
  }
}

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    de: { translation: de },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  // React already escapes rendered strings.
  interpolation: { escapeValue: false },
});

export default i18n;

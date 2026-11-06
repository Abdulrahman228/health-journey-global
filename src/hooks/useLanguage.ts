import { useState, useEffect, useCallback } from "react";

export type Language =
  | "ar"
  | "en"
  | "fr"
  | "es"
  | "de"
  | "tr"
  | "ur"
  | "fa"
  | "hi"
  | "zh"
  | "ru"
  | "pt"
  | "sw";

/**
 * Currently active languages shown in the language picker.
 *
 * Only languages with FULL, professionally-verified translations are listed here
 * to keep the UX honest and avoid SEO penalties (Google/Rank Math flag pages
 * that declare hreflang=fr but serve English content).
 *
 * The `Language` type still includes future locales (fr, de, tr, ur, …) so
 * translation dictionaries can be added incrementally — once a locale reaches
 * full coverage, just re-add it to this array.
 */
export const LANGUAGES: { code: Language; label: string; nativeLabel: string; dir: "ltr" | "rtl" }[] = [
  { code: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl" },
  { code: "en", label: "English", nativeLabel: "English", dir: "ltr" },
];

const RTL_LANGS: Language[] = ["ar", "ur", "fa"];

/** Broadcast so every mounted useLanguage() instance switches together. */
const LANG_EVENT = "tabibi-lang-change";

export function isRTL(lang: Language) {
  return RTL_LANGS.includes(lang);
}

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>("ar");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("tabibi-lang");
    const known = LANGUAGES.find((l) => l.code === stored);
    if (known) setLanguageState(known.code);
    setIsReady(true);

    // Every component has its own useLanguage() state: without this, picking a
    // language in the Header only re-rendered the Header, not the page.
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Language>).detail;
      if (LANGUAGES.some((l) => l.code === next)) setLanguageState(next);
    };
    window.addEventListener(LANG_EVENT, onChange);
    return () => window.removeEventListener(LANG_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const html = document.documentElement;
    html.lang = language;
    html.dir = isRTL(language) ? "rtl" : "ltr";
    localStorage.setItem("tabibi-lang", language);
  }, [language, isReady]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    window.dispatchEvent(new CustomEvent<Language>(LANG_EVENT, { detail: lang }));
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "ar" : "en");
  }, [language, setLanguage]);

  /**
   * Translate helper.
   * Usage:
   *   t("Sign In", "تسجيل الدخول")  // legacy EN/AR
   *   t({ en: "Sign In", ar: "تسجيل الدخول", fr: "Connexion", ... })
   * Falls back to English, then Arabic.
   */
  function t(en: string, ar: string): string;
  function t(map: Partial<Record<Language, string>>): string;
  function t(a: string | Partial<Record<Language, string>>, b?: string): string {
    if (typeof a === "string") {
      const map: Partial<Record<Language, string>> = { en: a, ar: b ?? a };
      return map[language] ?? map.en ?? a;
    }
    return a[language] ?? a.en ?? a.ar ?? "";
  }

  return { language, setLanguage, toggleLanguage, t, isReady, isRTL: isRTL(language) };
}

import { useEffect, useMemo, useState } from "react";
import type { Theme } from "../components/SharedUI";
import { translate, type Language } from "../i18n/translations";

const THEME_STORAGE_KEY = "near-market.theme";
const LANGUAGE_STORAGE_KEY = "near-market-language";

function readTheme(): Theme {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function readLanguage(): Language {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "am" ? "am" : "en";
  } catch {
    return "en";
  }
}

export function usePreferences() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [language, setLanguageState] = useState<Language>(readLanguage);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The selected theme still applies for the current session.
    }
  }, [theme]);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // The interface still updates for this session when storage is unavailable.
    }
  }

  const t = useMemo(() => translate(language), [language]);
  return { theme, setTheme, language, setLanguage, t };
}

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { en, type StringKey } from "./en";
import { readPref, writePref } from "../lib/prefs";

// English is the only language. To add one later: create a strings file with the same keys,
// add it to LOCALES, and let people pick it in Settings.
const LOCALES = { en } as const;
export type Lang = keyof typeof LOCALES;
type T = (key: StringKey, vars?: Record<string, string | number>) => string;

/** Any stored or legacy value (for example the old "bm") falls back to English. */
export function resolveLang(stored: string | null | undefined): Lang {
  return stored && stored in LOCALES ? (stored as Lang) : "en";
}

export function translate(lang: Lang, key: StringKey, vars?: Record<string, string | number>) {
  const raw: string = LOCALES[lang]?.[key] ?? en[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : raw;
}

const Ctx = createContext<{ lang: Lang; t: T }>({ lang: "en", t: (k, v) => translate("en", k, v) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => {
    const stored = readPref("lang");
    const lang = resolveLang(stored);
    if (stored !== null && stored !== lang) writePref("lang", lang); // clear a legacy "bm" choice
    document.documentElement.lang = lang;
    return { lang, t: ((k, v) => translate(lang, k, v)) as T };
  }, []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export type { StringKey };

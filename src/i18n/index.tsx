import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { en, type StringKey } from "./en";
import { bm } from "./bm";
import { readPref, writePref } from "../lib/prefs";

export type Lang = "en" | "bm";
type T = (key: StringKey, vars?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: StringKey, vars?: Record<string, string | number>) {
  const raw: string = (lang === "bm" ? bm[key] : undefined) ?? en[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : raw;
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T }>({
  lang: "en",
  setLang: () => {},
  t: (k, v) => translate("en", k, v),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (readPref("lang") === "bm" ? "bm" : "en"));
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writePref("lang", l);
    document.documentElement.lang = l === "bm" ? "ms" : "en";
  }, []);
  const t = useCallback<T>((k, v) => translate(lang, k, v), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export type { StringKey };

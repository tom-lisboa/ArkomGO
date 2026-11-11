"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

import { en, type Dict } from "./en";
import { pt } from "./pt";

/**
 * Locale state (Pkg9 · N1). Hand-rolled, single-locale-plus-toggle — mirrors
 * `lib/plan.tsx` (context + hook + localStorage). No i18n lib: the app is
 * client-heavy with no locale routing, so `next-intl`/`i18next` would add
 * routing + middleware weight that never pays off (R1 Q4).
 *
 * `useT()` returns the whole typed dictionary for the active locale, so call
 * sites read `t.shell.nav.map` / `t.hub.skillsLive(13)`.
 */
export type Locale = "en" | "pt";
const LOCALE_KEY = "skilltree-locale";
const LOCALE_CHANGE_EVENT = "arkom-locale-change";
const DICTS: Record<Locale, Dict> = { en, pt };

interface LocaleCtx {
  locale: Locale;
  t: Dict;
  setLocale: (l: Locale) => void;
  toggle: () => void;
}
const Ctx = createContext<LocaleCtx | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(
    (onStoreChange) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === LOCALE_KEY) onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
      };
    },
    () => {
      try {
        return (localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "pt") as Locale;
      } catch {
        return "pt" as Locale;
      }
    },
    () => "pt" as Locale,
  );

  const setLocale = useCallback((l: Locale) => {
    try {
      localStorage.setItem(LOCALE_KEY, l);
      window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  }, []);

  const toggle = useCallback(() => setLocale(locale === "en" ? "pt" : "en"), [locale, setLocale]);

  return <Ctx.Provider value={{ locale, t: DICTS[locale], setLocale, toggle }}>{children}</Ctx.Provider>;
}

/** Returns the typed dictionary for the active locale. */
export function useT(): Dict {
  return useLocale().t;
}

export function useLocale(): LocaleCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLocale/useT must be used within <LocaleProvider>");
  return c;
}

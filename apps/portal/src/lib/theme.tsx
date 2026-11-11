"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Theme state for the unified light/dark mechanism (Pkg9 · N5).
 *
 * The original Arkom scattered the theme across 3 mechanisms + 2 storage
 * keys (html[data-theme] on the shell, body.light on map/dash, light-first on
 * chart). The clone corrects that gap: ONE attribute `html[data-theme]` + ONE
 * key `skilltree-theme` drive all four token systems. `.dark` is kept in sync
 * so the shadcn `@custom-variant dark (&:is(.dark *))` still resolves.
 *
 * The pre-paint script in <head> (layout.tsx) applies the stored value before
 * first paint, so this provider only mirrors + writes on toggle.
 */
export type Theme = "light" | "dark";
const THEME_KEY = "skilltree-theme";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}
const Ctx = createContext<ThemeCtx | null>(null);

function apply(t: Theme) {
  const el = document.documentElement;
  el.setAttribute("data-theme", t);
  el.classList.toggle("dark", t === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default matches the app's current identity (dark); the head script has
  // already applied the stored value, so read it back to stay in sync.
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    let stored: Theme = "dark";
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === "light" || raw === "dark") stored = raw;
    } catch {
      /* storage unavailable */
    }
    setThemeState(stored);
    apply(stored);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    apply(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return <Ctx.Provider value={{ theme, toggle, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within <ThemeProvider>");
  return c;
}

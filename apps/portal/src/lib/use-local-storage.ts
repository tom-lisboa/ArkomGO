"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * localStorage-backed state. SSR-safe: renders `initial` on the server and first
 * client paint, then hydrates from storage on mount (so no hydration mismatch).
 */
export function useLocalStorage<T>(
  key: string,
  initial: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [val, setVal] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setVal(JSON.parse(raw) as T);
    } catch {
      /* storage unavailable / bad JSON — keep initial */
    }
  }, [key]);

  const set = useCallback(
    (value: T | ((prev: T) => T)) => {
      setVal((prev) => {
        const next =
          typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [key]
  );

  return [val, set];
}

/* ---- brain interview (Item 3) ---- */
export const BRAIN_KEY = "skilltree-brain";
export interface BrainState {
  answers: Record<string, string | string[]>;
  step: number;
  completed: boolean;
}
export const EMPTY_BRAIN: BrainState = { answers: {}, step: 0, completed: false };

/* ---- installed skills (Item 4) ---- */
export const INSTALLED_KEY = "skilltree-installed";

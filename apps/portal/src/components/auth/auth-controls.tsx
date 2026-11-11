"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

const controlClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-st-line-2 bg-st-card px-3 text-[11px] font-semibold text-st-ink-2 backdrop-blur-xl transition-colors hover:bg-st-card-2 hover:text-st-ivory";

export function AuthControls() {
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleTheme}
        className={`${controlClass} w-9 px-0`}
        aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
      >
        {theme === "dark" ? (
          <Moon aria-hidden className="size-3.5" />
        ) : (
          <Sun aria-hidden className="size-3.5" />
        )}
      </button>
    </div>
  );
}

"use client";

import { Search } from "lucide-react";

import { useT } from "@/lib/i18n";
import { usePalette } from "@/components/palette/CommandPalette";

export function SearchBar() {
  const t = useT();
  const { open } = usePalette();
  return (
    <button
      type="button"
      onClick={open}
      className="flex h-[54px] w-full items-center gap-3 rounded-[10px] border border-st-line-2 bg-st-card px-4 text-left transition-colors hover:bg-st-card-2"
    >
      <Search className="size-[18px] shrink-0 text-st-ink-2" strokeWidth={2} />
      <span className="flex-1 truncate text-[14px] text-st-ink-2">
        {t.hub.searchPlaceholder}
      </span>
      <span className="hidden shrink-0 items-center gap-1 sm:flex">
        <kbd className="flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-st-line px-1 text-[11px] text-st-ink-2">
          ⌘
        </kbd>
        <kbd className="flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-st-line px-1 text-[11px] text-st-ink-2">
          K
        </kbd>
      </span>
    </button>
  );
}

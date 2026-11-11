"use client";

import Link from "next/link";
import { Maximize2, Minimize2, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocale, useT } from "@/lib/i18n";
import { loc, DASH_PT, navTab } from "@/lib/content-pt";
import { CENTERS } from "./dash-data";

const TABS = [
  { label: "MAP", href: "/map" },
  { label: "DASHBOARDS", href: "/dash" },
  { label: "CHART", href: "/chart" },
];

// dash dedicada de Soluções (ARKOM_APP_MODE=solutions): MAP/CHART não existem
// nesse deploy — as tabs viram SOLUÇÕES | PAINÉIS.
const SOLUTIONS_TABS = [
  { label: "SOLUTIONS", href: "/solutions" },
  { label: "DASHBOARDS", href: "/dash" },
];

const glass = {
  background: "var(--st-glass)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid var(--st-line)",
} as const;

export function DashTopbar({
  enteredName,
  onPick,
  solutionsMode = false,
  centers = CENTERS,
}: {
  enteredName: string | null;
  onPick: (index: number) => void;
  solutionsMode?: boolean;
  /** centers efetivos (nomes tematizados pelos builders) — base da busca. */
  centers?: typeof CENTERS;
}) {
  const t = useT();
  const { locale } = useLocale();
  const tr = (s: string) => loc(locale, s, DASH_PT[s]);
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return centers.map((c, index) => ({ c, index }))
      .filter((r) => r.c.name.toLowerCase().includes(q) || r.c.short.toLowerCase().includes(q) || r.c.tools.join(" ").toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, centers]);

  const pick = useCallback(
    (index: number) => {
      onPick(index);
      setQuery("");
      setOpen(false);
    },
    [onPick]
  );

  const showDrop = open && results.length > 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-3 py-3 pl-[60px] sm:px-6 sm:pl-6">
      {/* left: fullscreen + search */}
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={toggleFull}
          aria-label={t.common.toggleFullscreen}
          className="flex size-[34px] items-center justify-center rounded-[9px] text-[var(--ivory-2)] transition-colors hover:text-[var(--ivory)]"
          style={glass}
        >
          {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        <div className="relative">
          <div className="flex h-[34px] items-center gap-2 rounded-[9px] px-3 sm:w-[230px]" style={glass}>
            <Search size={15} className="shrink-0 text-[var(--ink-2)]" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                blurTimer.current = setTimeout(() => setOpen(false), 140);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) pick(results[0].index);
                else if (e.key === "Escape") {
                  setQuery("");
                  setOpen(false);
                  e.currentTarget.blur();
                }
              }}
              placeholder={t.dash.searchPanels}
              aria-label={t.dash.searchPanels}
              autoComplete="off"
              spellCheck={false}
              className="w-full min-w-0 bg-transparent text-[12.5px] font-medium text-[var(--ivory)] outline-none placeholder:text-[var(--ink-3)]"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="shrink-0 text-[var(--ink-3)] transition-colors hover:text-[var(--ivory-2)]">
                <X size={13} />
              </button>
            ) : null}
          </div>

          {showDrop ? (
            <div
              className="absolute left-0 top-[40px] w-[280px] rounded-[10px] py-1"
              style={{
                background: "rgba(14,16,22,.96)",
                backdropFilter: "blur(18px) saturate(1.2)",
                WebkitBackdropFilter: "blur(18px) saturate(1.2)",
                border: "1px solid var(--st-line)",
                boxShadow: "0 30px 80px -30px rgba(0,0,0,.7)",
              }}
            >
              {results.map((r) => (
                <button
                  key={r.c.id}
                  type="button"
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    pick(r.index);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[rgba(233,228,214,.06)]"
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: r.c.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-[var(--ivory)]">{tr(r.c.name)}</span>
                    <span className="block truncate text-[10.5px] text-[var(--ink-2)]">{tr(r.c.sub)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* center: MAP / DASHBOARDS / CHART (ou SOLUÇÕES / PAINÉIS na dash dedicada) */}
      <nav className="pointer-events-auto flex items-center gap-0.5 sm:absolute sm:left-1/2 sm:-translate-x-1/2" style={glass}>
        {(solutionsMode ? SOLUTIONS_TABS : TABS).map((t) => {
          const activeTab = t.label === "DASHBOARDS";
          return activeTab ? (
            <span
              key={t.label}
              aria-current="page"
              className="rounded-[6px] px-2.5 py-1.5 text-[10px] font-bold tracking-[0.18em] text-[var(--bg)] sm:px-4"
              style={{ background: "var(--ivory)" }}
            >
              {navTab(locale, t.label)}
            </span>
          ) : (
            <Link
              key={t.label}
              href={t.href}
              className="rounded-[6px] px-2.5 py-1.5 text-[10px] font-bold tracking-[0.18em] text-[var(--ink-2)] transition-colors hover:text-[var(--ivory)] sm:px-4"
            >
              {navTab(locale, t.label)}
            </Link>
          );
        })}
      </nav>

      {/* right: current dashboard name */}
      <div className="pointer-events-auto flex items-center gap-3.5">
        {enteredName ? (
          <span className="hidden text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--copper)] lg:inline">{enteredName}</span>
        ) : null}
      </div>
    </div>
  );
}

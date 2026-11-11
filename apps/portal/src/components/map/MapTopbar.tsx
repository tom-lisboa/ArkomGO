"use client";

import Link from "next/link";
import { Maximize2, Minimize2, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocale, useT } from "@/lib/i18n";
import { navTab, deptName, functionName, jobName, LEVEL_LABEL_PT } from "@/lib/content-pt";
import { LEVEL_LABEL, type Job } from "./skilltree-data";

/** one searchable job across the whole tree. */
export interface SearchEntry {
  job: Job;
  deptIndex: number;
  deptId: string;
  deptName: string;
  deptColor: string;
  fnName: string;
}

const TABS = [
  { label: "MAP", href: "/map", locked: false },
  { label: "DASHBOARDS", href: "/dash", locked: true },
  { label: "CHART", href: "/chart", locked: true },
];

const glass = {
  background: "var(--map-glass)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid var(--map-line)",
} as const;

interface MapTopbarProps {
  searchIndex: SearchEntry[];
  onPick: (entry: SearchEntry) => void;
}

export function MapTopbar({ searchIndex, onPick }: MapTopbarProps) {
  const tr = useT();
  const { locale } = useLocale();
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
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchIndex
      .filter((e) => {
        // match the EN source AND (when pt) the PT display, so an empresário
        // typing "vendas"/"negócios" finds the same row shown to them.
        const hay = [e.job.name, e.fnName, e.deptName];
        if (locale === "pt") {
          hay.push(
            jobName(locale, e.job.name),
            functionName(locale, e.fnName),
            deptName(locale, e.deptName)
          );
        }
        return hay.some((s) => s.toLowerCase().includes(q));
      })
      .slice(0, 16);
  }, [query, searchIndex, locale]);

  const pick = useCallback(
    (entry: SearchEntry) => {
      onPick(entry);
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
          aria-label={tr.common.toggleFullscreen}
          className="flex size-[34px] items-center justify-center rounded-[9px] text-[var(--map-ivory-2)] transition-colors hover:text-[var(--map-ivory)]"
          style={glass}
        >
          {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        <div className="relative">
          <div
            className="flex h-[34px] items-center gap-2 rounded-[9px] px-3 sm:w-[248px]"
            style={glass}
          >
            <Search size={15} className="shrink-0 text-[var(--map-ink-2)]" />
            <input
              data-testid="map-search"
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
                if (e.key === "Enter" && results[0]) pick(results[0]);
                else if (e.key === "Escape") {
                  setQuery("");
                  setOpen(false);
                  e.currentTarget.blur();
                }
              }}
              placeholder={tr.map.searchPlaceholder}
              aria-label={tr.map.searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className="w-full min-w-0 bg-transparent text-[12.5px] font-medium text-[var(--map-ivory)] outline-none placeholder:text-[var(--map-ink-3)]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="shrink-0 text-[var(--map-ink-3)] transition-colors hover:text-[var(--map-ivory-2)]"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          {showDrop ? (
            <div
              className="map-scroll absolute left-0 top-[40px] max-h-[62vh] w-[300px] rounded-[10px] py-1"
              style={{
                background: "var(--map-drawer-bg)",
                backdropFilter: "blur(16px) saturate(1.2)",
                WebkitBackdropFilter: "blur(16px) saturate(1.2)",
                border: "1px solid var(--map-drawer-border)",
                boxShadow: "0 30px 80px -30px rgba(0,0,0,.7)",
              }}
            >
              {results.map((e) => (
                <button
                  key={`${e.deptId}-${e.job.id}`}
                  data-testid={`search-result-${e.job.id}`}
                  type="button"
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    pick(e);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[rgba(233,228,214,.06)]"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: e.deptColor }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-[var(--map-ivory)]">
                      {jobName(locale, e.job.name)}
                    </span>
                    <span className="block truncate text-[10.5px] text-[var(--map-ink-2)]">
                      {deptName(locale, e.deptName)} · {functionName(locale, e.fnName)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--map-ink-3)]">
                    {locale === "pt" ? LEVEL_LABEL_PT[LEVEL_LABEL[e.job.level]] : LEVEL_LABEL[e.job.level]}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* center: só os tabs liberados — os travados (DASHBOARDS/CHART) ficam ocultos. */}
      <nav className="pointer-events-auto flex items-center gap-1 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
        {TABS.filter((t) => !t.locked).map((t) => {
          const active = t.label === "MAP";
          const tabFont = {
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
          } as const;

          return (
            <Link
              key={t.label}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-[8px] px-2.5 py-1.5 text-[10px] font-bold tracking-[0.18em] transition-colors sm:px-3.5 ${
                active
                  ? "text-[var(--map-bg)]"
                  : "text-[var(--map-ink-2)] hover:text-[var(--map-ivory)]"
              }`}
              style={{
                ...tabFont,
                ...(active ? { background: "var(--map-ivory)" } : {}),
              }}
            >
              {navTab(locale, t.label)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

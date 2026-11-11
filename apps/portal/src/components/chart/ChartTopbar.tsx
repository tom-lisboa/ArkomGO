"use client";

import Link from "next/link";
import { Calendar, Maximize2, Minimize2, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useLocale, useT } from "@/lib/i18n";
import { navTab } from "@/lib/content-pt";

const TABS = [
  { label: "MAP", href: "/map" },
  { label: "DASHBOARDS", href: "/dash" },
  { label: "CHART", href: "/chart" },
];

interface ChartTopbarProps {
  query: string;
  onQuery: (q: string) => void;
}

/** The floating chrome row: fullscreen + live search · MAP/DASH/CHART · book. */
export function ChartTopbar({ query, onQuery }: ChartTopbarProps) {
  const tr = useT();
  const { locale } = useLocale();
  const [full, setFull] = useState(false);

  useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  return (
    <header className="topbar">
      <div className="topleft">
        <button
          type="button"
          onClick={toggleFull}
          aria-label={tr.common.toggleFullscreen}
          className="glasschip flex w-[34px] items-center justify-center text-[var(--c-ink2)] transition-colors hover:text-[var(--c-ink)]"
        >
          {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        <div className="glasschip topsearch">
          <Search className="ts-ic" />
          <input
            className="ts-in"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={tr.common.searchJobs}
            aria-label={tr.common.searchJobs}
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label={tr.common.clearSearch}
              className="shrink-0 text-[var(--c-ink3)] transition-colors hover:text-[var(--c-ink2)]"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="tabs">
        {TABS.map((tab) => {
          const active = tab.label === "CHART";
          return active ? (
            <a key={tab.label} className="on" aria-current="page">
              {navTab(locale, tab.label)}
            </a>
          ) : (
            <Link key={tab.label} href={tab.href}>
              {navTab(locale, tab.label)}
            </Link>
          );
        })}
      </nav>

      <a
        className="book"
        href="https://cal.com/arkom/30min"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Calendar size={13} />
        <span className="hidden sm:inline">{tr.map.bookCall}</span>
      </a>
    </header>
  );
}

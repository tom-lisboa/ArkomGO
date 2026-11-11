"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";

import { DEPARTMENT_COLOR, DROPS, FEATURED_DROP } from "@/lib/hub-data";
import { DEPARTMENTS } from "@/components/map/skilltree-data";
import { useLocale, useT } from "@/lib/i18n";
import { deptNamePt, skillNamePt } from "@/components/hub/skill-names-pt";

interface CatalogItem {
  name: string;
  department: string;
  color: string;
}

/** Named drops first, then the public skill slugs from every job (dedupe by slug). */
function buildCatalog(): CatalogItem[] {
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  const push = (name: string, department: string, color: string) => {
    const k = name.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ name, department, color });
    }
  };

  push(FEATURED_DROP.title, FEATURED_DROP.department, DEPARTMENT_COLOR[FEATURED_DROP.department]);
  DROPS.forEach((d) => push(d.title, d.department, DEPARTMENT_COLOR[d.department]));
  for (const dept of DEPARTMENTS) {
    for (const fn of dept.functions) {
      for (const job of fn.jobs) {
        for (const s of job.skills) push(s, dept.name, dept.color);
      }
    }
  }
  return out;
}

interface FindMorePanelProps {
  open: boolean;
  onClose: () => void;
  installed: string[];
  onInstall: (name: string) => void;
}

/** Right-side drawer listing installable skills, with search. Install routes
 *  through the parent (free → paywall, pro → adds to the tree). */
export function FindMorePanel({ open, onClose, installed, onInstall }: FindMorePanelProps) {
  const t = useT();
  const { locale } = useLocale();
  const catalog = useMemo(buildCatalog, []);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? catalog.filter(
          (c) =>
            c.name.toLowerCase().includes(query) ||
            c.department.toLowerCase().includes(query)
        )
      : catalog;
    return list.slice(0, 30);
  }, [q, catalog]);

  if (!open) return null;
  const installedSet = new Set(installed.map((s) => s.toLowerCase()));

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} aria-hidden />
      <aside
        className="fixed bottom-0 right-0 top-0 z-[61] flex w-[380px] max-w-[calc(100vw-24px)] flex-col border-l border-st-sidebar-line"
        style={{
          background: "var(--st-sidebar-glass)",
          backdropFilter: "blur(20px) saturate(1.3)",
          WebkitBackdropFilter: "blur(20px) saturate(1.3)",
          boxShadow: "var(--st-shadow)",
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-st-line-2 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-st-ivory">{t.tree.findMore}</h3>
            <p className="text-[12px] text-st-ink-3">{t.tree.findMoreSub}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="grid size-7 place-items-center rounded-md border border-st-line-2 text-st-ink-2 transition-colors hover:text-st-ivory"
          >
            <X size={13} />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex h-9 items-center gap-2 rounded-[10px] border border-st-line-2 bg-white/[0.03] px-3">
            <Search size={14} className="shrink-0 text-st-ink-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.tree.searchSkills}
              className="w-full min-w-0 bg-transparent text-[13px] text-st-ivory outline-none placeholder:text-st-ink-3"
            />
          </div>
        </div>

        <div className="mt-3 flex-1 overflow-auto px-3 pb-4">
          {results.map((item) => {
            const isInstalled = installedSet.has(item.name.toLowerCase());
            return (
              <div
                key={item.name}
                className="flex items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-white/[0.03]"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: item.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-st-ivory">{skillNamePt(item.name, locale)}</span>
                  <span className="block truncate text-[11px] text-st-ink-3">
                    {deptNamePt(item.department, locale)}
                  </span>
                </span>
                {isInstalled ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-st-ink-2">
                    <Check size={13} />
                    {t.tree.installed}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onInstall(item.name)}
                    className="shrink-0 rounded-[8px] bg-st-ivory px-2.5 py-1 text-[11.5px] font-semibold text-st-bg transition-colors hover:bg-white"
                  >
                    {t.tree.install}
                  </button>
                )}
              </div>
            );
          })}
          {results.length === 0 ? (
            <p className="px-2 py-6 text-center text-[13px] text-st-ink-3">
              {t.tree.noMatch(q)}
            </p>
          ) : null}
        </div>
      </aside>
    </>
  );
}

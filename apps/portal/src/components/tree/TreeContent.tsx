"use client";

import { useState } from "react";
import { GitBranch, Trash2 } from "lucide-react";

import { usePlan } from "@/lib/plan";
import { useLocale, useT } from "@/lib/i18n";
import { INSTALLED_KEY, useLocalStorage } from "@/lib/use-local-storage";
import { skillNamePt } from "@/components/hub/skill-names-pt";
import { PaywallModal } from "@/components/PaywallModal";
import { TreeStats } from "./TreeStats";
import { FindMorePanel } from "./FindMorePanel";

/**
 * /tree body. Owns the installed list (single source of truth for this page) so
 * the stats, the tree list, and the Find More panel all stay in sync live.
 * Install is pro-gated: free → paywall, pro → adds to localStorage.
 */
export function TreeContent() {
  const { isPro, showToast } = usePlan();
  const t = useT();
  const { locale } = useLocale();
  const [installed, setInstalled] = useLocalStorage<string[]>(INSTALLED_KEY, []);
  const [findOpen, setFindOpen] = useState(false);
  const [paywall, setPaywall] = useState(false);

  const install = (name: string) => {
    if (!isPro) {
      setPaywall(true);
      return;
    }
    setInstalled((prev) => (prev.includes(name) ? prev : [...prev, name]));
    showToast(t.tree.installedToast(name));
  };
  const remove = (name: string) =>
    setInstalled((prev) => prev.filter((x) => x !== name));

  return (
    <div className="w-full">
      {/* Page header + Find more */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[30px] font-extrabold leading-none tracking-tight text-st-ivory">
          {t.tree.title}
          <span className="ml-2.5 align-baseline text-[15px] font-normal text-st-ink-2">
            {t.tree.titleSub}
          </span>
        </h1>
        <button
          type="button"
          onClick={() => setFindOpen(true)}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] border border-st-line-2 bg-st-card px-3.5 text-[13px] text-st-ivory transition-colors hover:bg-st-card-2"
        >
          {t.tree.findMoreShort}
        </button>
      </header>

      <TreeStats installedCount={installed.length} />

      {/* Your tree panel */}
      <section className="mt-6 rounded-[16px] border border-st-line-2 bg-st-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <GitBranch className="size-[18px] text-st-ink-2" />
            <h2 className="text-[17px] font-semibold text-st-ivory">{t.tree.yourTree}</h2>
            <span className="text-[13px] text-st-ink-3">{t.tree.nInstalled(installed.length)}</span>
          </div>
          <button
            type="button"
            onClick={() => setFindOpen(true)}
            className="shrink-0 text-[13px] text-st-ink-2 transition-colors hover:text-st-ivory"
          >
            {t.tree.findMoreShort} →
          </button>
        </div>

        {installed.length > 0 ? (
          <div className="mt-5 flex flex-col gap-2">
            {installed.map((name) => (
              <div
                key={name}
                className="flex items-center gap-3 rounded-[12px] border border-st-line-2 bg-white/[0.02] px-4 py-3"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-st-card-2 text-st-ink-2">
                  <GitBranch className="size-4" />
                </span>
                <span className="flex-1 truncate text-[14px] text-st-ivory">{skillNamePt(name, locale)}</span>
                <button
                  type="button"
                  onClick={() => remove(name)}
                  aria-label={t.tree.removeAria(name)}
                  className="shrink-0 rounded-[7px] p-1.5 text-st-ink-3 transition-colors hover:bg-white/[0.06] hover:text-st-ivory"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-st-line-2 bg-st-card px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full border border-st-line-2 bg-st-card-2">
              <GitBranch className="size-5 text-st-ink-3" />
            </span>
            <p className="max-w-[420px] text-[14px] leading-relaxed text-st-ink-2">
              {t.tree.emptyPre}
              <button
                type="button"
                onClick={() => setFindOpen(true)}
                className="text-st-ivory underline decoration-st-line-2 underline-offset-4 transition-colors hover:decoration-st-ivory"
              >
                {t.tree.emptyLink}
              </button>
              {t.tree.emptyPost}
            </p>
          </div>
        )}
      </section>

      <FindMorePanel
        open={findOpen}
        onClose={() => setFindOpen(false)}
        installed={installed}
        onInstall={install}
      />
      {paywall ? <PaywallModal onClose={() => setPaywall(false)} /> : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import { DESC_PT, OUTCOME_PT, loc } from "@/lib/content-pt";
import { MODULE_NAME_PT, type ModuleEntry } from "./modules-data";

/**
 * A wide, full-width module card: number badge + title + "Start" pill, the
 * pitch, and a "N lessons · what you walk away with" footer. Mirrors the
 * hub card treatment (radius 14, st-card surface) but carries the outcome line.
 */
export function ModuleRow({ module: mod }: { module: ModuleEntry }) {
  const t = useT();
  const { locale } = useLocale();
  const Icon = mod.icon;

  return (
    <Link
      href={mod.href}
      className="group flex gap-4 rounded-[14px] border border-st-line-2 bg-st-card p-5 transition-colors hover:border-white/20 hover:bg-st-card-2 sm:gap-5"
    >
      {/* Number badge */}
      <div className="flex size-[52px] shrink-0 flex-col items-center justify-center rounded-[12px] border border-st-line-2 bg-st-card-2">
        <Icon className="size-[15px] text-st-ink-2" />
        <span className="mt-0.5 text-[15px] font-bold leading-none tracking-[0.02em] text-st-ivory">
          {mod.num}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[18px] font-[650] leading-tight tracking-[-0.01em] text-st-ivory">
            {locale === "pt" ? MODULE_NAME_PT[mod.title] ?? mod.title : mod.title}
          </h2>
          <span className="shrink-0 rounded-[8px] bg-st-ivory px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-st-bg">
            {mod.progress ? t.modules.resumeModule : t.modules.startModule}
          </span>
        </div>

        <p className="mt-2 max-w-[600px] text-[13.5px] font-normal leading-relaxed text-st-ink-2">
          {loc(locale, mod.description, DESC_PT[mod.title])}
        </p>

        <p className="mt-3 text-[12px] font-semibold text-st-ink-2">
          {mod.progress
            ? `${mod.progress.done}/${t.modules.lessons(mod.progress.total)}`
            : t.modules.lessons(Number.parseInt(mod.lessons, 10))}
        </p>
        <p className="mt-2 max-w-[680px] text-[12.5px] leading-relaxed text-st-ink-3">
          {loc(locale, mod.outcome, OUTCOME_PT[mod.title])}
        </p>
        {mod.progress ? (
          <div className="mt-3 h-[3px] max-w-[300px] overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-st-ivory/70"
              style={{ width: `${(mod.progress.done / mod.progress.total) * 100}%` }}
            />
          </div>
        ) : null}
      </div>
      <ArrowRight className="size-[18px] shrink-0 self-center text-st-ink-3 transition-colors group-hover:text-st-ivory" />
    </Link>
  );
}

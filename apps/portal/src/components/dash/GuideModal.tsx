"use client";

import { GlassModal } from "@/components/GlassModal";
import { useLocale, useT } from "@/lib/i18n";
import { loc, DASH_PT } from "@/lib/content-pt";
import type { Center } from "./dash-data";

const GATED_PROMPT = `BUILD PROMPT · one-shot

You are building a production command-center dashboard.
Scaffold a Next.js (App Router, TypeScript) + Tailwind project,
server components by default, light + dark mode. Plus Jakarta Sans
for body, Marcellus for the big title + section headings, the
department accent reserved strictly for data-viz.

Snapshot the source API into Supabase on an Inngest cron so the
dashboard reads only from Postgres and never rate-limits the
provider on render. Then render the KPI row, the Signals card,
the primary chart, the breakdown bars, and the sortable, click-to-
peek table — exactly like the panel you just opened.

[ · the full, grounded one-shot prompt continues for ~180 lines · ]`;

export function GuideModal({ center, onClose }: { center: Center; onClose: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const tr = (s: string) => loc(locale, s, DASH_PT[s]);
  return (
    <GlassModal onClose={onClose} eyebrow={t.dash.guide.eyebrow} title={tr(center.name)} maxWidth={560}>
      <p className="text-[13px] leading-relaxed text-st-ink-2">
        {t.dash.guide.intro(tr(center.guide.tool))}
      </p>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-st-ink-3">
        {t.dash.guide.setup(tr(center.guide.tool), center.guide.time)}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-[13px] font-semibold text-st-ivory">{t.dash.guide.howItConnects}</div>
        <p className="text-[13px] leading-relaxed text-st-ink-2">{tr(center.guide.connect)}</p>
      </div>

      <pre
        className="mt-4 max-h-[260px] overflow-hidden whitespace-pre-wrap rounded-[10px] px-4 py-3 font-mono text-[11.5px] leading-[1.7] text-st-ink-2"
        style={{ background: "rgba(233,228,214,.03)", border: "1px solid rgba(233,228,214,.1)" }}
      >
        {GATED_PROMPT}
      </pre>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-[10px] bg-[#ECECEE] py-2.5 text-[13px] font-bold text-[#0A0A0C] transition-opacity hover:opacity-90"
      >
        {t.dash.guide.unlockPrompt}
      </button>
      <div className="mt-3 text-[11px] text-st-ink-3">
        {t.dash.guide.membership}
      </div>
    </GlassModal>
  );
}

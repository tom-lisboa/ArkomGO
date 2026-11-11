"use client";

import { DEPARTMENT_COLOR, NEXT_DROP } from "@/lib/hub-data";
import { usePlan } from "@/lib/plan";
import { useLocale, useT } from "@/lib/i18n";
import { weekdayPt } from "@/lib/content-pt";
import { deptNamePt, skillNamePt } from "./skill-names-pt";

/** "NEXT DROP" line above the featured drop — member state only (Pkg5 Item 6). */
export function NextDropBanner() {
  const { isPro } = usePlan();
  const t = useT();
  const { locale } = useLocale();
  if (!isPro) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-st-line-2 bg-st-card px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-st-ink-3">
          <span
            className="size-1.5 rounded-full"
            style={{ background: DEPARTMENT_COLOR[NEXT_DROP.department] }}
          />
          {t.hub.cards.nextDrop}
        </span>
        <span className="font-semibold text-st-ivory">{skillNamePt(NEXT_DROP.title, locale)}</span>
        <span className="text-st-ink-3">· {deptNamePt(NEXT_DROP.department, locale)}</span>
      </div>
      <span className="shrink-0 text-[11.5px] font-medium text-st-ink-2">
        {t.hub.cards.lands(locale === "pt" ? weekdayPt(NEXT_DROP.when) : NEXT_DROP.when)}
      </span>
    </div>
  );
}

"use client";

import { Activity, ScrollText, Trophy } from "lucide-react";

import { BUILD_LOG, MOST_INSTALLED } from "@/lib/hub-data";
import { useLocale, useT } from "@/lib/i18n";
import { BUILDLOG_PT, installsPt } from "@/lib/content-pt";
import { skillNamePt } from "./skill-names-pt";

/** Community pulse feed — verbatim from the original hub (REF-P14, live capture). */
const PULSE: { name: string | null; hours: number }[] = [
  { name: "Lead Sourcing Manager", hours: 6 },
  { name: "Meeting Intelligence Engineer", hours: 6 },
  { name: "Brain Sync", hours: 6 },
  { name: "Inbound Response Manager", hours: 6 },
  { name: "Icp Strategist", hours: 6 },
  { name: null, hours: 9 }, // "A member built their brain"
];

export function HubAside() {
  const t = useT();
  const { locale } = useLocale();
  const pt = locale === "pt";
  return (
    <aside className="flex flex-col gap-5">
      {/* Most installed — .panel: flat, hairline border, 13px radius, row dividers (P14) */}
      <section className="rounded-[13px] border border-st-line-2 bg-st-card">
        <div className="flex items-center justify-between border-b border-st-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-st-ivory">
            <Trophy className="size-4 text-st-ink-2" />
            {t.hub.cards.mostInstalled}
          </h3>
          <span className="text-[12px] text-st-ink-3">{t.hub.cards.allTime}</span>
        </div>
        <ol className="flex flex-col px-5 py-1.5">
          {MOST_INSTALLED.map((item, i) => (
            <li
              key={item.rank}
              className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-st-line" : ""}`}
            >
              <span className="w-4 text-[12px] tabular-nums text-st-ink-3">
                {item.rank}
              </span>
              <span className="flex-1 truncate text-[13px] font-medium text-st-ivory">
                {skillNamePt(item.name, locale)}
              </span>
              <span className="shrink-0 text-[12px] text-st-ink-3">
                {pt ? installsPt(item.installs) : item.installs}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Community pulse — section from the original hub, previously missing (P14) */}
      <section className="rounded-[13px] border border-st-line-2 bg-st-card">
        <div className="flex items-center justify-between border-b border-st-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-st-ivory">
            <Activity className="size-4 text-st-ink-2" />
            {t.hub.cards.communityPulse}
          </h3>
          <span className="text-[12px] text-st-ink-3">{t.hub.cards.live}</span>
        </div>
        <ul className="flex flex-col px-5 py-1.5">
          {PULSE.map((row, i) => (
            <li
              key={i}
              className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-st-line" : ""}`}
            >
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-st-ivory text-[10px] font-bold text-st-bg">
                ST
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-st-ink-2">
                {row.name ? (
                  <>
                    <span className="font-semibold text-st-ivory">
                      {t.hub.cards.memberInstalled.split(" ").slice(0, 2).join(" ")}
                    </span>{" "}
                    {t.hub.cards.memberInstalled.split(" ").slice(2).join(" ")}{" "}
                    <span className="font-semibold text-st-ivory">
                      {skillNamePt(row.name, locale)}
                    </span>
                  </>
                ) : (
                  <span className="font-semibold text-st-ivory">
                    {t.hub.cards.memberBuiltBrain}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[12px] text-st-ink-3">
                {t.hub.cards.hoursAgo(row.hours)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Build logs */}
      <section className="rounded-[13px] border border-st-line-2 bg-st-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-st-ivory">
            <ScrollText className="size-4 text-st-ink-2" />
            {t.hub.cards.buildLogs}
          </h3>
          <span className="text-[12px] text-st-ink-3">
            {t.hub.cards.from(BUILD_LOG.author)}
          </span>
        </div>
        <p className="mt-4 text-[13.5px] font-[650] leading-snug text-st-ivory">
          {pt ? BUILDLOG_PT.title : BUILD_LOG.title}
        </p>
        <p className="mt-2 text-[12px] text-st-ink-3">{pt ? BUILDLOG_PT.meta : BUILD_LOG.meta}</p>
        <p className="mt-3 line-clamp-4 text-[12px] leading-relaxed text-st-ink-2">
          {/* "nó zero" normalized at render — canonical PT lives in content-pt BUILDLOG_PT (font-builder's, not editable here) */}
          {pt ? BUILDLOG_PT.excerpt.replace("node zero", "nó zero") : BUILD_LOG.excerpt}
        </p>
      </section>
    </aside>
  );
}

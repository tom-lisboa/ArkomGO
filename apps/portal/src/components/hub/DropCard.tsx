"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { DEPARTMENT_COLOR, type DropItem } from "@/lib/hub-data";
import { useLocale, useT } from "@/lib/i18n";
import { DESC_PT, installsPt, loc, timeAgoPt } from "@/lib/content-pt";
import { SkillReaderModal } from "./SkillReaderModal";
import { deptNamePt, skillNamePt } from "./skill-names-pt";

/**
 * Fresh-drops card (Pkg11 · N7 FD1). The whole card is one button that opens the
 * skill reader; "Install" is a decorative span inside (matches the live `.drop`).
 */
export function DropCard({
  drop,
  descriptionPt,
}: {
  drop: DropItem;
  /** PT description override for drops not in the font-builder's DESC_PT (Pkg13 N2). */
  descriptionPt?: string;
}) {
  const Icon = drop.icon;
  const t = useT();
  const { locale } = useLocale();
  const pt = locale === "pt";
  const [open, setOpen] = useState(false);
  const slug = drop.href.replace(/^\/drops\//, "");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="drop group flex min-h-[200px] w-full flex-col rounded-[12px] border border-st-line-2 bg-st-card p-5 text-left transition-all hover:border-st-copper-line hover:bg-st-card-2 hover:shadow-[0_0_0_1px_var(--st-copper-line),0_18px_44px_-22px_#18181b8c]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-[7px] bg-st-card-2 text-st-ink-2">
              <Icon className="size-[13px]" />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-st-line px-2 py-0.5 text-[11px] text-st-ink-2">
              <span
                className="size-1.5 rounded-full"
                style={{ background: DEPARTMENT_COLOR[drop.department] }}
              />
              {deptNamePt(drop.department, locale)}
            </span>
          </div>
          <span className="text-[11.5px] font-medium text-st-ink-3">
            {pt ? timeAgoPt(drop.time) : drop.time}
          </span>
        </div>

        <h3 className="mt-3 text-[16px] font-bold leading-tight tracking-[-0.02em] text-st-ivory">
          {skillNamePt(drop.title, locale)}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-st-ink-2">
          {loc(locale, drop.description, descriptionPt ?? DESC_PT[drop.title])}
        </p>

        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-st-ink-3">
            <Download className="size-3.5" />
            {pt ? installsPt(drop.installs) : drop.installs}
          </span>
          {/* Decorative — the whole card opens the reader (FD1). Ghost copper-soft
              install pill (P14 — matches the live `.install`). */}
          <span className="rounded-[8px] border border-st-line-2 bg-st-copper-soft px-[13px] py-[7px] text-[12.5px] font-semibold text-st-ivory">
            {t.hub.cards.install}
          </span>
        </div>
      </button>

      {open ? (
        <SkillReaderModal
          slug={slug}
          title={drop.title}
          department={drop.department}
          description={drop.description}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

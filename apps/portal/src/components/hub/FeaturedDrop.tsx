"use client";

import { useState } from "react";
import { Star } from "lucide-react";

import { DEPARTMENT_COLOR, FEATURED_DROP, type FeaturedDropData } from "@/lib/hub-data";
import { useLocale, useT } from "@/lib/i18n";
import { DESC_PT, FEATURED_META_PT, loc } from "@/lib/content-pt";
import { SkillReaderModal } from "./SkillReaderModal";
import { slugify } from "./skill-previews";
import { deptNamePt, skillNamePt } from "./skill-names-pt";

/**
 * Featured drop (Pkg11 · N7 FD1). Like the drops, the whole card opens the reader;
 * "Install skill" is a decorative span. Poster gradient is the original's decorative
 * dark panel (unchanged).
 */
export function FeaturedDrop({
  featured = FEATURED_DROP,
  metaPt = FEATURED_META_PT,
  descriptionPt,
}: {
  featured?: FeaturedDropData;
  /** PT meta override (the /drops featured has different age/installs than the hub). */
  metaPt?: string;
  descriptionPt?: string;
} = {}) {
  const t = useT();
  const { locale } = useLocale();
  const pt = locale === "pt";
  const [open, setOpen] = useState(false);
  const slug = slugify(featured.title);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group grid w-full overflow-hidden rounded-[18px] border border-st-copper-line bg-st-card text-left shadow-[0_0_0_1px_var(--st-copper-line),0_22px_60px_-34px_#18181b80] md:grid-cols-[320px_1fr]"
      >
        {/* Poster panel — .fcover internal gradient + dot-pattern (P14) */}
        <div className="st-fcover relative flex min-h-[150px] items-end overflow-hidden p-4 md:min-h-[236px]">
          <span
            className="relative z-10 text-[10px] font-bold uppercase tracking-[0.15em]"
            style={{ color: DEPARTMENT_COLOR[featured.department] }}
          >
            {deptNamePt(featured.department, locale)}
          </span>
        </div>

        {/* Content panel */}
        <div className="flex flex-col justify-center gap-3 bg-st-card px-[30px] py-[26px]">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-st-ink-2">
            <Star className="size-3 fill-current" />
            {t.hub.cards.featuredEyebrow}
          </div>
          <h2 className="text-[24px] font-bold leading-tight tracking-[-0.02em] text-st-ivory">
            {skillNamePt(featured.title, locale)}
          </h2>
          <p className="text-[14px] leading-relaxed text-st-ink-2">
            {loc(locale, featured.description, descriptionPt ?? DESC_PT[featured.title])}
          </p>
          <p className="text-[12px] text-st-ink-3">
            {pt ? metaPt : featured.meta}
          </p>
          <div className="pt-1">
            {/* Decorative — the whole card opens the reader (FD1). Solid copper CTA
                with the measured hover-lift (P14). */}
            <span className="inline-flex items-center gap-2 rounded-[10px] bg-st-copper px-4 py-2.5 text-[13px] font-semibold text-st-copper-ink transition-shadow group-hover:shadow-[0_16px_38px_-12px_rgba(24,24,27,0.85),inset_0_1px_0_rgba(255,255,255,0.35)]">
              {t.hub.cards.installSkill}
              <span aria-hidden>→</span>
            </span>
          </div>
        </div>
      </button>

      {open ? (
        <SkillReaderModal
          slug={slug}
          title={featured.title}
          department={featured.department}
          description={featured.description}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

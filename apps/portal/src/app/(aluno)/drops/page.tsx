"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Shell } from "@/components/Shell";
import { useT } from "@/lib/i18n";
import { DropCard } from "@/components/hub/DropCard";
import { FeaturedDrop } from "@/components/hub/FeaturedDrop";
import { DROPS_FEATURED, DROPS_FEATURED_META_PT, DROPS_GRID } from "./drops-data";

/**
 * /drops (Pkg13 · N2) — the full, static drops page: header + featured full-width +
 * a 3-up grid of the 12 cards + footer. No filters/pagination/lazy-load (matches the
 * logged original). Every card opens the same SkillReaderModal via DropCard. Reuses
 * DropCard/FeaturedDrop from the hub; its own dataset lives in ./drops-data.
 */
export default function DropsPage() {
  const t = useT();
  return (
    <Shell>
      <div className="w-full">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-[27px] font-bold leading-none tracking-[-0.02em] text-st-ivory">
            {t.drops.title}
            <span className="ml-2.5 align-baseline text-[15px] font-normal text-st-ink-2">
              {t.drops.sub}
            </span>
          </h1>
          <Link
            href="/hub"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] border border-st-line-2 bg-st-card px-3.5 text-[13px] font-medium text-st-ivory transition-colors hover:bg-st-card-2"
          >
            <ArrowLeft className="size-3.5" />
            {t.drops.back}
          </Link>
        </header>

        {/* Featured — full width */}
        <div className="mt-6">
          <FeaturedDrop featured={DROPS_FEATURED} metaPt={DROPS_FEATURED_META_PT} />
        </div>

        {/* Grid — 3 up */}
        <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DROPS_GRID.map((item) => (
            <DropCard key={item.href} drop={item} descriptionPt={item.descriptionPt} />
          ))}
        </section>

        {/* Footer */}
        <p className="mt-16 text-center text-[12px] text-st-ink-3">{t.drops.footer}</p>
      </div>
    </Shell>
  );
}

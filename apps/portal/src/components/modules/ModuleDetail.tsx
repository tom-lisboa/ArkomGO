"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronRight } from "lucide-react";

import { Shell } from "@/components/Shell";
import { useLocale, useT } from "@/lib/i18n";
import { MODULE_DETAIL, type ModuleSlug } from "./content";
import { MODULE_NAME_PT } from "./modules-data";

/**
 * A single module detail page (Pkg10 · N5): serif module title, the outcome
 * box, a progress bar, the verbatim lesson list, and a prominent "next module"
 * card. Lesson rows are read-only — the reader route was not part of the logged
 * spec (R1 B5 captured structure only), so nothing links into a fabricated
 * article. Everything is token-driven so it holds in dark + light, EN + PT.
 */
export function ModuleDetail({ slug }: { slug: ModuleSlug }) {
  const t = useT();
  const { locale } = useLocale();
  const data = MODULE_DETAIL[slug];
  // PT translates module names on every surface (N7 R2); EN renders verbatim.
  const nameFor = (name: string) =>
    locale === "pt" ? MODULE_NAME_PT[name] ?? name : name;
  const pct = data.progress.total
    ? (data.progress.done / data.progress.total) * 100
    : 0;

  return (
    <Shell>
      <div className="mx-auto w-full max-w-[820px]">
        {/* Back to the modules index */}
        <Link
          href="/modules"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-st-ink-2 transition-colors hover:text-st-ivory"
        >
          <ArrowLeft className="size-3.5" />
          {t.modules.backAll}
        </Link>

        {/* Header — eyebrow + serif title */}
        <header className="mt-5">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-st-ink-3">
            {t.modules.moduleEyebrow(data.num)}
          </p>
          <h1 className="mt-2 font-display text-[33px] font-normal leading-[1.1] tracking-[-0.01em] text-st-ivory">
            {nameFor(data.title)}
          </h1>
        </header>

        {/* "You'll walk away with" — outcome box */}
        <section className="mt-6 rounded-[10px] border border-st-line-2 bg-st-card p-4">
          <p className="text-[13.5px] leading-relaxed text-st-ink-2">
            <span className="font-semibold text-st-ivory">{t.modules.walkAway} </span>
            {data.outcome[locale]}
          </p>
        </section>

        {/* Progress */}
        <div className="mt-6 flex items-center gap-3">
          <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-st-line-2">
            <div
              className="h-full rounded-full bg-st-ivory"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-[12px] font-semibold text-st-ivory">
            {t.modules.lessonsComplete(data.progress.done, data.progress.total)}
          </span>
        </div>

        {/* Lesson list */}
        <ol className="mt-6 flex flex-col gap-2.5">
          {data.lessons.map((lesson, i) => (
            <li
              key={lesson.title.en}
              className="flex items-center gap-3.5 rounded-[12px] border border-st-line-2 bg-st-card px-[18px] py-[15px]"
            >
              {/* Number / done check */}
              <div className="flex w-6 shrink-0 justify-center">
                {lesson.done ? (
                  <Check className="size-[17px] text-st-ivory" strokeWidth={2.4} />
                ) : (
                  <span className="text-[13px] font-semibold tabular-nums text-st-ink-3">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                )}
              </div>

              {/* Title + blurb */}
              <div className="min-w-0 flex-1">
                <h2 className="text-[14.5px] font-semibold leading-snug text-st-ivory">
                  {lesson.title[locale]}
                </h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-st-ink-2">
                  {lesson.blurb[locale]}
                </p>
              </div>

              {/* Right group — Done · duration · chevron */}
              <div className="flex shrink-0 items-center gap-3">
                {lesson.done ? (
                  <span className="rounded-full bg-st-ivory/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-st-ivory">
                    {t.modules.lessonDone}
                  </span>
                ) : null}
                <span className="text-[11.5px] tabular-nums text-st-ink-3">
                  {lesson.min}
                </span>
                <ChevronRight className="size-4 text-st-ink-3" />
              </div>
            </li>
          ))}
        </ol>

        {/* Prev / Next navigation */}
        <nav className="mt-10 flex flex-wrap items-center justify-between gap-4">
          {data.prev ? (
            <Link
              href={data.prev.href}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-st-ink-2 transition-colors hover:text-st-ivory"
            >
              <ArrowLeft className="size-3.5" />
              <span>
                {t.modules.previous}
                <span className="text-st-ink-3"> · </span>
                {nameFor(data.prev.label)}
              </span>
            </Link>
          ) : (
            <span />
          )}

          <Link
            href={data.next.href}
            className="group ml-auto inline-flex items-center gap-3 rounded-[12px] bg-st-ivory px-[17px] py-[13px] text-st-bg transition-opacity hover:opacity-90"
          >
            <span className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-st-bg/70">
                {t.modules.nextModule}
              </span>
              <span className="text-[14px] font-semibold">
                {data.next.isMap ? t.modules.exploreMap : nameFor(data.next.label)}
              </span>
            </span>
            {data.next.isMap ? (
              <ArrowUpRight className="size-4 shrink-0" />
            ) : (
              <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            )}
          </Link>
        </nav>
      </div>
    </Shell>
  );
}

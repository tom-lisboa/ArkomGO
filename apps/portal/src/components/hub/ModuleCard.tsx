"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import { DESC_PT, loc } from "@/lib/content-pt";
import { MODULE_NAME_PT } from "@/components/modules/modules-data";
import type { ModuleItem } from "@/lib/hub-data";

export function ModuleCard({ module: item }: { module: ModuleItem }) {
  const t = useT();
  const { locale } = useLocale();
  const lessonsN = Number.parseInt(item.lessons, 10);

  return (
    <Link
      href={item.href}
      className="group flex min-h-[152px] flex-col rounded-[14px] border border-st-line-2 bg-st-card px-5 py-[18px] transition-colors hover:border-white/20 hover:bg-st-card-2"
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-st-ink-3">
          {loc(locale, item.label, item.label.replace("Module", "Módulo"))}
        </span>
        <ArrowUpRight className="size-4 text-st-ink-3 transition-colors group-hover:text-st-ivory" />
      </div>
      <h3 className="mt-3 text-[16px] font-[650] leading-tight tracking-[-0.01em] text-st-ivory">
        {locale === "pt" ? MODULE_NAME_PT[item.title] ?? item.title : item.title}
      </h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-st-ink-2">
        {loc(locale, item.description, DESC_PT[item.title])}
      </p>
      {item.progress ? (
        <div className="mt-auto pt-3">
          <span className="text-[11.5px] font-semibold text-st-ink-3">
            {item.progress.done}/{t.modules.lessons(item.progress.total)}
          </span>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-st-ivory/70"
              style={{ width: `${(item.progress.done / item.progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <span className="mt-auto pt-3 text-[11.5px] font-semibold text-st-ink-3">
          {t.modules.lessons(lessonsN)}
        </span>
      )}
    </Link>
  );
}

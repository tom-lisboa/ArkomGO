"use client";

import { Fragment } from "react";
import { LayoutGrid } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import { MODULE_ENTRIES, MODULE_PATHLABEL_PT } from "./modules-data";

/**
 * The Arkom build path (Pkg10 · N7 R1): four nodes seated on one continuous
 * line — three numbered circles (the live modules) leading into the square
 * "workforce" goal node — with the label centered under each. Rebuilt to match
 * the logged original (was arrow-separated pills). Token-driven for dark + light.
 */
export function ModulePath() {
  const t = useT();
  const { locale } = useLocale();

  const nodes = [
    ...MODULE_ENTRIES.map((mod) => ({
      key: mod.href,
      num: mod.num,
      label:
        locale === "pt"
          ? MODULE_PATHLABEL_PT[mod.pathLabel] ?? mod.pathLabel
          : mod.pathLabel,
      square: false,
    })),
    { key: "workforce", num: "", label: t.modules.yourWorkforce, square: true },
  ];

  return (
    <figure
      className="mt-8 rounded-[16px] border border-st-line-2 bg-st-card p-6 sm:p-8"
      aria-label="The Arkom path: Start Here, Foundations and Second Brain lead into your live AI workforce"
    >
      <div className="flex items-start">
        {nodes.map((node, i) => (
          <Fragment key={node.key}>
            <div className="flex shrink-0 flex-col items-center gap-2.5">
              {node.square ? (
                <span className="grid size-10 place-items-center rounded-[11px] border border-st-line-2 bg-st-card-2 text-st-ivory">
                  <LayoutGrid className="size-[17px]" />
                </span>
              ) : (
                <span className="grid size-10 place-items-center rounded-full border border-st-line-2 bg-st-card-2 text-[13px] font-bold text-st-ivory">
                  {node.num}
                </span>
              )}
              <span className="whitespace-nowrap text-center text-[12px] font-medium text-st-ink-2">
                {node.label}
              </span>
            </div>
            {i < nodes.length - 1 ? (
              <div className="mt-5 h-px flex-1 bg-st-line-2" />
            ) : null}
          </Fragment>
        ))}
      </div>
    </figure>
  );
}

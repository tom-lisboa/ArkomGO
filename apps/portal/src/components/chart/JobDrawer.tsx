"use client";

import { Calendar, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useLocale, useT } from "@/lib/i18n";
import { loc, JOB_DESC_PT, LADDER_PT, howToRunPt, whyHumanPt, skillName, jobName, functionName } from "@/lib/content-pt";
import { cn } from "@/lib/utils";
import type { Level } from "@/components/map/skilltree-data";
import { JobGlyph } from "./JobGlyph";
import {
  howToRun,
  LADDER_RUNGS,
  whyHuman,
  type LaneClass,
  type PlacedJob,
} from "./chart-matrix";

export interface DrawerTarget {
  placed: PlacedJob;
  deptName: string;
}

const LANE_CLASS: Record<Level, LaneClass> = {
  manual: "led",
  assisted: "ass",
  autonomous: "aut",
};
/** Autonomy level → dict legend key (title reads from tr.chart.legend). */
const LEVEL_LEGEND: Record<Level, "led" | "assisted" | "autonomous"> = {
  manual: "led",
  assisted: "assisted",
  autonomous: "autonomous",
};
/** Stage number (1-4) → dict key, so the stage badge reads tr.chart.stages. */
const STAGE_KEYS = ["foundation", "capture", "generate", "orchestrate"] as const;

interface JobDrawerProps {
  target: DrawerTarget | null;
  onClose: () => void;
}

/**
 * The slide-in detail panel. Renders the 7-field template — Skills · Replaces ·
 * What it does · Why it stays human · From manual to autonomous · Tools · How to
 * run it — filled ONLY from the exposed job data (desc, skills, tools, level).
 * The paid "Replaces" (cost-by-hand) body stays locked.
 *
 * Naming: `tr` is the i18n dictionary (useT); `t` is the drawer's data target
 * (kept distinct so the two never collide — Pkg9 · N2).
 */
export function JobDrawer({ target, onClose }: JobDrawerProps) {
  const tr = useT();
  const { locale } = useLocale();
  const pt = locale === "pt";
  // keep the last target during the slide-out so content doesn't flash empty.
  // Guarded setState-during-render — the React-sanctioned "derive from prop"
  // pattern (https://react.dev/learn/you-might-not-need-an-effect).
  const [cached, setCached] = useState<DrawerTarget | null>(target);
  if (target && target !== cached) setCached(target);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  const show = Boolean(target);
  const t = target ?? cached;
  const job = t?.placed.job;
  const cls = job ? LANE_CLASS[job.level] : "led";
  const rationale = job ? (pt ? whyHumanPt(job.level) : whyHuman(job.level)) : null;
  const stg = t?.placed.stage ?? null;

  return (
    <>
      <div
        className={cn("chart-scrim", show && "show")}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn("chart-drawer", show && "show")}
        aria-hidden={!show}
        aria-label={job ? `${job.name} detail` : undefined}
      >
        {t && job ? (
          <>
            <div className="dr-head">
              <button
                type="button"
                className="dr-close"
                onClick={onClose}
                aria-label={tr.common.close}
              >
                <X size={15} />
              </button>
              <div className="dr-top">
                <div className={cn("dr-icon", cls)}>
                  <JobGlyph name={job.name} />
                </div>
                <div className="dr-titles">
                  <div className="dr-team">
                    {t.deptName} · {functionName(locale, t.placed.fnName)}
                  </div>
                  <div className="dr-name">{jobName(locale, job.name)}</div>
                </div>
              </div>
              <div className="dr-badges">
                <span className="dr-badge">
                  <span className={cn("bdot", cls)} />
                  <b>{tr.chart.legend[LEVEL_LEGEND[job.level]]}</b>
                </span>
                {stg ? (
                  <span className="dr-badge">
                    <span className="wp">
                      {[1, 2, 3, 4].map((i) => (
                        <i key={i} className={cn(i <= stg && "fill")} />
                      ))}
                    </span>
                    <b>
                      {stg} · {tr.chart.stages[STAGE_KEYS[stg - 1]]}
                    </b>
                  </span>
                ) : (
                  <span className="dr-badge">
                    <b>{tr.chart.drawer.ongoing}</b>
                  </span>
                )}
              </div>
            </div>

            <div className="dr-body">
              <div className="dr-sect">
                <div className="dr-label">{tr.chart.drawer.replaces}</div>
                <p className="dr-replaces">{tr.chart.drawer.replacesBody}</p>
              </div>

              <div className="dr-sect">
                <div className="dr-label">{tr.chart.drawer.whatItDoes}</div>
                <p className="dr-desc">{loc(locale, job.desc, JOB_DESC_PT[job.name])}</p>
              </div>

              {rationale ? (
                <div className="dr-sect">
                  <div className="dr-label">{tr.chart.drawer.whyHuman}</div>
                  <p className="dr-human">{rationale}</p>
                </div>
              ) : null}

              <div className="dr-sect">
                <div className="dr-label">{tr.chart.drawer.ladder}</div>
                <div className="dr-ladder">
                  {LADDER_RUNGS.map((r) => {
                    const now = r.level === job.level;
                    return (
                      <div key={r.level} className={cn("dr-rung", now && "now")}>
                        <div className="rk">
                          <span className="rdot" />
                          <span className="rline" />
                        </div>
                        <div className="rt">
                          <div className="rname">
                            {pt ? LADDER_PT[r.label]?.label ?? r.label : r.label}
                            {now ? <span className="rnow">{tr.chart.drawer.now}</span> : null}
                          </div>
                          <div className="rdesc">{pt ? LADDER_PT[r.label]?.desc ?? r.desc : r.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="dr-sect">
                <div className="dr-label">{tr.chart.drawer.skills}</div>
                {job.skills.length > 0 ? (
                  <div className="dr-chips">
                    {job.skills.map((s) => (
                      <span key={s} className="dr-chip">
                        <span className="cd" />
                        {skillName(locale, s)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="dr-none">
                    {job.level === "manual"
                      ? tr.chart.drawer.noSkillManual
                      : tr.chart.drawer.skillInProgress}
                  </p>
                )}
              </div>

              <div className="dr-sect">
                <div className="dr-label">{tr.chart.drawer.tools}</div>
                {job.tools.length > 0 ? (
                  <div className="dr-chips">
                    {job.tools.map((tool) => (
                      <span key={tool} className="dr-chip tool">
                        <span className="cd" />
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="dr-none">{tr.chart.drawer.noTools}</p>
                )}
              </div>

              <div className="dr-sect">
                <div className="dr-label">{loc(locale, "How to run it", "Como rodar")}</div>
                <p className="dr-notes">
                  {pt
                    ? howToRunPt(jobName(locale, job.name), t.deptName, functionName(locale, t.placed.fnName), job.skills.length, job.tools, job.level)
                    : howToRun(job, t.deptName, t.placed.fnName)}
                </p>
              </div>
            </div>

            <div className="dr-foot">
              <span className="fhint">{tr.chart.drawer.partOfRollout(t.deptName)}</span>
              <a
                href="https://cal.com/arkom/30min"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Calendar size={13} />
                {tr.chart.drawer.bookCall}
              </a>
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}

"use client";

import { ChevronDown, ArrowRight } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import { loc, JOB_DESC_PT, skillName, jobName } from "@/lib/content-pt";
import { cn } from "@/lib/utils";
import { JobGlyph } from "./JobGlyph";
import { type PlacedJob } from "./chart-matrix";

/** Stage number (1-4) → dict key, so the stage chip reads t.chart.stages. */
const STAGE_KEYS = ["foundation", "capture", "generate", "orchestrate"] as const;

interface JobCardProps {
  placed: PlacedJob;
  open: boolean;
  dim: boolean;
  onToggle: () => void;
  onMore: () => void;
}

/** Pips row inside the stage chip — 4 dots, filled up to the job's stage. */
function Pips({ stage }: { stage: number }) {
  return (
    <span className="pips">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("pip", i <= stage && "fill")} />
      ))}
    </span>
  );
}

/** A single job cell-card: collapsed head → inline accordion → "More detail". */
export function JobCard({
  placed,
  open,
  dim,
  onToggle,
  onMore,
}: JobCardProps) {
  const t = useT();
  const { locale } = useLocale();
  const { job, stage } = placed;

  return (
    <div
      className={cn("card", open && "open", dim && "search-dim")}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="card-head">
        <span className="card-ic">
          <JobGlyph name={job.name} />
        </span>
        <div className="card-main">
          <div className="card-name">{jobName(locale, job.name)}</div>
          <div className="card-meta">
            {stage ? (
              <span className="stagechip">
                {stage} · {t.chart.stages[STAGE_KEYS[stage - 1]]}{" "}
                <Pips stage={stage} />
              </span>
            ) : (
              <span className="stagechip">{t.chart.drawer.ongoing}</span>
            )}
          </div>
        </div>
        <ChevronDown className="chev" size={16} strokeWidth={1.9} />
      </div>

      <div className="card-body">
        <div className="inner">
          <div className="body-pad">
            <div className="desc">{loc(locale, job.desc, JOB_DESC_PT[job.name])}</div>
            <div className="chipgroup">
              <div className="chiplabel">{t.chart.drawer.skills}</div>
              <div className="chips">
                {job.skills.length > 0 ? (
                  job.skills.map((s) => (
                    <span key={s} className="chip">
                      {skillName(locale, s)}
                    </span>
                  ))
                ) : (
                  <span className="chip none">
                    {job.level === "manual"
                      ? loc(locale, "A person owns this", "Uma pessoa cuida disso")
                      : loc(locale, "skill in progress", "skill em desenvolvimento")}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              className="moredetail"
              onClick={(e) => {
                e.stopPropagation();
                onMore();
              }}
            >
              {t.chart.drawer.moreDetail}
              <ArrowRight size={13} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

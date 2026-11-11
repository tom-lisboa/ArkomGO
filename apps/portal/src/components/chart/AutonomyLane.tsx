"use client";

import type { LucideIcon } from "lucide-react";
import { PenLine, Users, Workflow } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import { LANE_DESC_PT, LANE_NAME_PT } from "@/lib/content-pt";
import { JobCard } from "./JobCard";
import { laneCells, type Lane, type PlacedJob } from "./chart-matrix";

const LANE_ICON: Record<Lane["cls"], LucideIcon> = {
  led: Users,
  ass: PenLine,
  aut: Workflow,
};

interface AutonomyLaneProps {
  lane: Lane;
  openUid: string | null;
  query: string;
  matches: (p: PlacedJob) => boolean;
  onToggle: (uid: string) => void;
  onMore: (p: PlacedJob) => void;
}

/** One autonomy band: label column + 4 stage cells filled with job cards. */
export function AutonomyLane({
  lane,
  openUid,
  query,
  matches,
  onToggle,
  onMore,
}: AutonomyLaneProps) {
  const cells = laneCells(lane);
  const Icon = LANE_ICON[lane.cls];
  const t = useT();
  const { locale } = useLocale();
  const pt = locale === "pt";

  return (
    <section className={`lane ${lane.cls}`}>
      <div className="lanelabel">
        <span className="licon">
          <Icon size={18} />
        </span>
        <span className="lname">{pt ? LANE_NAME_PT[lane.name] ?? lane.name : lane.name}</span>
        <span className="ldesc">{pt ? LANE_DESC_PT[lane.name] ?? lane.desc : lane.desc}</span>
        <span className="lcount">
          <span className="n">{lane.jobs.length}</span> {t.chart.jobsWord}
        </span>
      </div>

      {cells.map((cellJobs, idx) =>
        cellJobs.length === 0 ? (
          <div key={idx} className="cell empty">
            <span className="emptymark">—</span>
          </div>
        ) : (
          <div key={idx} className="cell">
            {cellJobs.map((p) => (
              <JobCard
                key={p.uid}
                placed={p}
                open={openUid === p.uid}
                dim={query.trim().length > 0 && !matches(p)}
                onToggle={() => onToggle(p.uid)}
                onMore={() => onMore(p)}
              />
            ))}
          </div>
        )
      )}
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";

import { DEPARTMENTS } from "@/components/map/skilltree-data";
import { useLocale, useT } from "@/lib/i18n";
import { deptName } from "@/lib/content-pt";
import { cn } from "@/lib/utils";
import { AutonomyLane } from "./AutonomyLane";
import { ChartTopbar } from "./ChartTopbar";
import { JobDrawer, type DrawerTarget } from "./JobDrawer";
import { StageRibbon } from "./StageRibbon";
import { buildBoard, jobMatches, type PlacedJob } from "./chart-matrix";

/**
 * CHART — the AI rollout · stage ribbon × autonomy lanes.
 * Department tabs switch the board; each board is 4 rollout stages (x) ×
 * 3 autonomy lanes (y), fed by the real exposed tree.
 */
export function ChartView() {
  const t = useT();
  const { locale } = useLocale();
  const [activeIdx, setActiveIdx] = useState(0);
  const [query, setQuery] = useState("");
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);

  const board = useMemo(() => buildBoard(DEPARTMENTS[activeIdx]), [activeIdx]);

  const matches = useMemo(
    () => (p: PlacedJob) => jobMatches(p, query),
    [query]
  );

  const selectDept = (idx: number) => {
    setActiveIdx(idx);
    setOpenUid(null);
  };

  const toggleCard = (uid: string) =>
    setOpenUid((cur) => (cur === uid ? null : uid));

  const openMore = (p: PlacedJob) =>
    setDrawer({ placed: p, deptName: deptName(locale, board.dept.name) });

  return (
    <div className="chartview">
      <ChartTopbar query={query} onQuery={setQuery} />

      <div className="pane">
        {/* DEPARTMENT TABS */}
        <nav className="deptbar" aria-label="Departments">
          {DEPARTMENTS.map((d, i) => (
            <button
              key={d.id}
              type="button"
              className={cn("dept", i === activeIdx && "on")}
              aria-current={i === activeIdx ? "page" : undefined}
              onClick={() => selectDept(i)}
            >
              {deptName(locale, d.name)}
            </button>
          ))}
        </nav>

        {/* HEADER LINE + LEGEND */}
        <div className="pagehead">
          <div>
            <h1>
              {deptName(locale, board.dept.name)} <span className="em">{t.chart.subtitle}</span>
            </h1>
            <p className="subline">
              <b>{t.chart.rolloutBold(board.counts.autonomous, board.counts.total)}</b>{" "}
              {t.chart.rolloutMid} <b>{t.chart.assistedBold(board.counts.assisted)}</b>{" "}
              {t.chart.rolloutEnd}
            </p>
          </div>
          <div className="legend">
            <span className="lg">
              <span className="sw led" />
              {t.chart.legend.led}
            </span>
            <span className="lg">
              <span className="sw ass" />
              {t.chart.legend.assisted}
            </span>
            <span className="lg">
              <span className="sw aut" />
              {t.chart.legend.autonomous}
            </span>
          </div>
        </div>

        {/* BOARD : STAGE RIBBON × AUTONOMY LANES */}
        <main className="boardwrap">
          <div className="boardgrid">
            <StageRibbon />
            {board.lanes.map((lane) => (
              <AutonomyLane
                key={lane.level}
                lane={lane}
                openUid={openUid}
                query={query}
                matches={matches}
                onToggle={toggleCard}
                onMore={openMore}
              />
            ))}
          </div>
        </main>
      </div>

      <JobDrawer target={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

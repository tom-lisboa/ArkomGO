"use client";

import { memo, useMemo } from "react";

import { useLocale } from "@/lib/i18n";
import { loc, DEPT_SUB_PT, skillName, deptName, functionName, jobName } from "@/lib/content-pt";
import { computeFan } from "./geometry";
import type { FanLayout, Pt } from "./geometry";
import { DEPARTMENTS, deptGlyph, jobGlyph, type Job, type Level } from "./skilltree-data";

/** how a fan currently participates in a lateral slide (source `.fan` classes). */
export type FanPhase = "in" | "enter-r" | "enter-l" | "exit-l" | "exit-r" | "collapse";

/** one live fan on screen. Usually 1; transiently 2 during a slide. */
export interface FanLayerState {
  key: number;
  deptIndex: number;
  phase: FanPhase;
}

/** node visual state per autonomy level (baseline · the product's capability). */
const NODE_STATE: Record<Level, string> = {
  autonomous: "deployed",
  assisted: "dev",
  manual: "plan",
};

const SVG_HALF = 1600;

function Glyph({ paths, size }: { paths: string; size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}

/** the small check that marks a node the user flagged "live". */
function MineBadge() {
  return (
    <span className="mybadge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13l4 4 10-10" />
      </svg>
    </span>
  );
}

interface FanLayerProps {
  layer: FanLayerState;
  /** id of the job whose card is open (only matches the in-phase fan). */
  activeJobId: string | null;
  /** user self-assessment for jobs of THIS department: jobId → "live" | "dev". */
  statusFor: (deptId: string, jobId: string) => "live" | "dev" | undefined;
  onSelectJob: (job: Job, deptId: string, fnName: string, pos: Pt) => void;
  /** open the central skill-preview modal for a leaf/dot (slug + owning job). */
  onSelectSkill: (slug: string, job: Job) => void;
}

/**
 * A single department expanded into the big fan — self-contained (own SVG + HTML)
 * so the whole thing translates as one unit during a lateral slide. Mirrors the
 * reference `buildFan`: arcs + per-function stubs/fndots + per-job chained edges,
 * then the root badge, department name, team labels and interactive job nodes.
 */
function FanLayerImpl({ layer, activeJobId, statusFor, onSelectJob, onSelectSkill }: FanLayerProps) {
  const { locale } = useLocale();
  const pt = locale === "pt";
  // layout only depends on which department this layer shows.
  const fan: FanLayout = useMemo(() => computeFan(DEPARTMENTS[layer.deptIndex]), [layer.deptIndex]);
  const color = fan.dept.color;

  // the function-chain that owns the open card — every OTHER chain fades (source R2).
  const activeFnId = activeJobId
    ? fan.functions.find((fl) => fl.jobs.some((jl) => jl.job.id === activeJobId))?.id ?? null
    : null;

  const phaseClass = layer.phase === "in" ? "" : ` ${layer.phase}`;

  return (
    <div className={`fan-layer${phaseClass}`} style={{ ["--c" as string]: color }}>
      {/* faint background wordmark */}
      <div className="fan-ghost">{deptName(locale, fan.dept.name)}</div>

      {/* per-fan SVG connective tissue (arcs + branches) */}
      <svg
        className="fan-under"
        style={{ left: -SVG_HALF, top: -SVG_HALF }}
        width={SVG_HALF * 2}
        height={SVG_HALF * 2}
        viewBox={`${-SVG_HALF} ${-SVG_HALF} ${SVG_HALF * 2} ${SVG_HALF * 2}`}
        aria-hidden
      >
        {fan.arcs.map((d, i) => (
          <path
            key={`arc${i}`}
            className="fan-arc draw"
            d={d}
            pathLength={1}
            style={{ ["--d" as string]: `${(0.1 + i * 0.07).toFixed(2)}s` }}
          />
        ))}
        {fan.functions.map((fl) => (
          <g key={fl.id}>
            <path
              className="fan-edge draw"
              d={fl.stub}
              pathLength={1}
              style={{ ["--d" as string]: "0.15s" }}
            />
            <circle
              className="fan-fndot popdot"
              cx={fl.fnDot.x}
              cy={fl.fnDot.y}
              r={5}
              fill={color}
              style={{ ["--d" as string]: "0.3s" }}
            />
            {fl.jobs.map((jl) => (
              <g key={jl.job.id}>
                {jl.leaves.map((lf, li) => (
                  <line
                    key={li}
                    className="fan-leaf-line"
                    x1={jl.pos.x}
                    y1={jl.pos.y}
                    x2={jl.pos.x + lf.off.x}
                    y2={jl.pos.y + lf.off.y}
                  />
                ))}
              <path
                className="fan-edge draw"
                d={jl.edge}
                pathLength={1}
                style={{
                  ["--d" as string]: `${jl.delay}s`,
                  strokeOpacity:
                    jl.job.level === "autonomous" ? 0.5 : jl.job.level === "assisted" ? 0.3 : 0.14,
                }}
              />
              </g>
            ))}
          </g>
        ))}
      </svg>

      {/* root badge + department name */}
      <div className="fan-root" style={{ left: 0, top: 0 }}>
        <Glyph paths={deptGlyph(fan.dept.name)} size={44} />
      </div>
      <div className="fan-dname">
        {deptName(locale, fan.dept.name)}
        <div className="fan-dsub">{loc(locale, fan.dept.sub, DEPT_SUB_PT[fan.dept.name])}</div>
      </div>

      {/* team labels + interactive job nodes */}
      {fan.functions.map((fl) => (
        <div key={fl.id}>
          <div
            className="team-label"
            style={{ left: fl.label.pos.x, top: fl.label.pos.y, ["--d" as string]: `${fl.label.delay}s` }}
          >
            <div className="tl-name">{functionName(locale, fl.label.name)}</div>
            <div className="tl-count">
              {fl.label.count} {pt ? (fl.label.count === 1 ? "função" : "funções") : "jobs"}
            </div>
          </div>

          {fl.jobs.map((jl) => {
            const my = statusFor(fan.dept.id, jl.job.id);
            const faded = activeFnId !== null && fl.id !== activeFnId ? " faded" : "";
            const mine = my === "live" ? " mine" : my === "dev" ? " minedev" : "";
            const active = activeJobId === jl.job.id ? " active" : "";
            return (
              <div
                key={jl.job.id}
                className="node-wrap"
                style={{ left: jl.pos.x, top: jl.pos.y, ["--d" as string]: `${(jl.delay + 0.18).toFixed(2)}s` }}
              >
                <button
                  type="button"
                  className={`fan-node ${NODE_STATE[jl.job.level]}${mine}${active}${faded}`}
                  aria-label={`${jobName(locale, jl.job.name)} · ${jl.job.level}${my === "live" ? (pt ? " · ativo no seu stack" : " · live in your stack") : ""}`}
                  onClick={() => onSelectJob(jl.job, fan.dept.id, fl.label.name, jl.pos)}
                >
                  <Glyph paths={jobGlyph(jl.job.name)} size={36} />
                  <MineBadge />
                </button>
                {jl.leaves.map((lf, li) => (
                  <span
                    key={li}
                    className="leaf"
                    role="button"
                    tabIndex={0}
                    aria-label={pt ? `Ver skill ${skillName(locale, lf.skill)}` : `View skill ${skillName(locale, lf.skill)}`}
                    data-sk={skillName(locale, lf.skill)}
                    style={{ transform: `translate(calc(-50% + ${lf.off.x}px), calc(-50% + ${lf.off.y}px))` }}
                    onClick={(e) => { e.stopPropagation(); onSelectSkill(lf.skill, jl.job); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onSelectSkill(lf.skill, jl.job); }
                    }}
                  />
                ))}
                {jl.startHere ? (
                  <span className="start-tag">{loc(locale, "START HERE", "COMECE AQUI")}</span>
                ) : null}
                <span className="node-label">{jobName(locale, jl.job.name)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const FanLayer = memo(FanLayerImpl);

interface FanStackProps {
  layers: FanLayerState[];
  activeJobId: string | null;
  statusFor: (deptId: string, jobId: string) => "live" | "dev" | undefined;
  onSelectJob: (job: Job, deptId: string, fnName: string, pos: Pt) => void;
  onSelectSkill: (slug: string, job: Job) => void;
}

/** the set of on-screen fans (1 normally, 2 mid-slide). */
export function FanStack({ layers, activeJobId, statusFor, onSelectJob, onSelectSkill }: FanStackProps) {
  return (
    <>
      {layers.map((layer) => (
        <FanLayer
          key={layer.key}
          layer={layer}
          // only the settled fan owns the open card; exiting fans just slide away.
          activeJobId={layer.phase === "in" ? activeJobId : null}
          statusFor={statusFor}
          onSelectJob={onSelectJob}
          onSelectSkill={onSelectSkill}
        />
      ))}
    </>
  );
}

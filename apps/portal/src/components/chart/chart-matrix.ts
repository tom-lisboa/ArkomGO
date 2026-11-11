/* ============================================================
   chart-matrix.ts — the CHART view model.

   Turns the REAL exposed tree (src/components/map/skilltree-data.ts —
   7 depts · 34 functions · 137 jobs, each with a `level`) into the
   "AI rollout" matrix: 4 rollout STAGES (x) × 3 autonomy LANES (y).

   The exposed jobs have NO stage field (the source authored a private
   `wave` per job). So the column position is DERIVED deterministically
   from tree position — no job copy is invented, only where a card sits.
   ============================================================ */

import {
  type Department,
  type Job,
  type Level,
} from "@/components/map/skilltree-data";

/* ---------- X axis: the 4 named rollout stages ---------- */
export interface Stage {
  n: 1 | 2 | 3 | 4;
  name: string;
  sub: string;
}
export const STAGES: readonly Stage[] = [
  { n: 1, name: "Foundation", sub: "Data + the company brain" },
  { n: 2, name: "Capture", sub: "Classify, extract, score" },
  { n: 3, name: "Generate", sub: "Produce work, take action" },
  { n: 4, name: "Orchestrate", sub: "Agents, monitoring, loops" },
] as const;

export type StageNum = 1 | 2 | 3 | 4;
export const stageName = (n: StageNum): string => STAGES[n - 1].name;

/**
 * DETERMINISTIC STAGE RULE — position only, zero content invented.
 *
 * A job inherits its rollout stage from the index of its FUNCTION within
 * the department: for a dept with `fnCount` functions, function `i`
 * (0-based) maps to `floor(i * 4 / fnCount) + 1`, clamped to 1..4.
 *
 * Why by function: the tree lists functions in natural pipeline order
 * (e.g. Targeting → Sourcing → Enrichment → Writing → Sequencing), so
 * earlier functions land in Foundation/Capture and later ones in
 * Generate/Orchestrate — exactly the "ROLLOUT ORDER · first → last"
 * narrative. Keeping a whole function in one column also gives coherent,
 * readable stage cells. Human-led (manual) jobs carry NO stage — they are
 * "Ongoing" and spread across the columns for balance (source behavior).
 */
export const stageForFunctionIndex = (i: number, fnCount: number): StageNum => {
  const s = Math.floor((i * 4) / Math.max(1, fnCount)) + 1;
  return Math.min(4, Math.max(1, s)) as StageNum;
};

/* ---------- a job placed in the matrix ---------- */
export interface PlacedJob {
  job: Job;
  /** the function this job belongs to (drawer team line + search). */
  fnName: string;
  /** derived rollout stage 1-4, or null for human-led ("Ongoing"). */
  stage: StageNum | null;
  /** stable id (dept-scoped) for open/drawer/search state. */
  uid: string;
}

/* ---------- Y axis: the 3 autonomy lanes ---------- */
export type LaneClass = "led" | "ass" | "aut";
export interface Lane {
  level: Level;
  cls: LaneClass;
  name: string;
  desc: string;
  jobs: PlacedJob[];
}

const LANE_META: Record<Level, { cls: LaneClass; name: string; desc: string }> = {
  manual: { cls: "led", name: "Human-led", desc: "A person drives it." },
  assisted: { cls: "ass", name: "Human-assisted", desc: "AI drafts, a human approves." },
  autonomous: { cls: "aut", name: "Fully autonomous", desc: "AI runs it unattended." },
};

export interface DeptBoard {
  dept: Department;
  /** lanes ordered top→bottom: human-led, human-assisted, fully autonomous. */
  lanes: Lane[];
  counts: { autonomous: number; assisted: number; manual: number; total: number };
  /** "19 of 22 jobs run autonomously · 3 assisted · the rest stay human." */
  summary: string;
}

/** Build the full board (ribbon feed + 3 lanes) for one department. */
export function buildBoard(dept: Department): DeptBoard {
  const fnCount = dept.functions.length;
  const placed: PlacedJob[] = [];
  dept.functions.forEach((fn, i) => {
    fn.jobs.forEach((job) => {
      placed.push({
        job,
        fnName: fn.name,
        stage: job.level === "manual" ? null : stageForFunctionIndex(i, fnCount),
        uid: `${dept.id}-${job.id}`,
      });
    });
  });

  const byLevel = (level: Level): PlacedJob[] =>
    placed.filter((p) => p.job.level === level);

  const order: Level[] = ["manual", "assisted", "autonomous"];
  const lanes: Lane[] = order.map((level) => ({
    level,
    ...LANE_META[level],
    jobs: byLevel(level),
  }));

  const counts = {
    autonomous: byLevel("autonomous").length,
    assisted: byLevel("assisted").length,
    manual: byLevel("manual").length,
    total: placed.length,
  };

  const summary = `${counts.autonomous} of ${counts.total} jobs run autonomously · ${counts.assisted} assisted · the rest stay human.`;

  return { dept, lanes, counts, summary };
}

/**
 * Split a lane's jobs into the 4 stage columns.
 * - autonomous / assisted → placed by their derived stage
 * - human-led (no stage) → spread by index across the columns (source parity)
 */
export function laneCells(lane: Lane): PlacedJob[][] {
  const cells: PlacedJob[][] = [[], [], [], []];
  if (lane.cls === "led") {
    lane.jobs.forEach((p, idx) => cells[idx % 4].push(p));
  } else {
    lane.jobs.forEach((p) => {
      if (p.stage) cells[p.stage - 1].push(p);
    });
  }
  return cells;
}

/* ---------- live search over the active board ---------- */
export function jobMatches(p: PlacedJob, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    p.job.name.toLowerCase().includes(q) ||
    p.job.desc.toLowerCase().includes(q) ||
    p.fnName.toLowerCase().includes(q) ||
    p.job.skills.some((s) => s.toLowerCase().includes(q)) ||
    p.job.tools.some((t) => t.toLowerCase().includes(q))
  );
}

/* ---------- drawer copy, derived from exposed fields only ---------- */
export const LADDER_RUNGS: { level: Level; label: string; desc: string }[] = [
  { level: "manual", label: "Manual", desc: "A person runs the whole job by hand." },
  {
    level: "assisted",
    label: "Assisted",
    desc: "AI does the heavy lifting; a human reviews and approves.",
  },
  {
    level: "autonomous",
    label: "Autonomous",
    desc: "The agent runs the job end-to-end, unattended.",
  },
];

/** The autonomy-lane rationale (derived from `level`, not paid content). */
export function whyHuman(level: Level): string | null {
  if (level === "manual")
    return "A person drives it. Judgment, taste, and relationships don't hand off cleanly — this one stays human by design.";
  if (level === "assisted")
    return "AI drafts, a human approves. The machine carries the volume; a person makes the final call before it ships.";
  return null; // fully autonomous — nothing stays human here
}

/** Operational "how to run it", composed from the exposed skills/tools/level. */
export function howToRun(
  job: Job,
  deptName: string,
  fnName: string
): string {
  const n = job.skills.length;
  const skillsPart =
    n > 0 ? `${n} skill file${n === 1 ? "" : "s"}` : "no dedicated skill file yet";
  const toolsPart =
    job.tools.length > 0 ? `, wired into ${job.tools.join(", ")}` : "";
  const mode =
    job.level === "autonomous"
      ? "fully unattended"
      : job.level === "assisted"
        ? "drafting for a human to approve"
        : "as a human-owned play";
  return `Trigger the ${job.name} skill from the ${deptName} · ${fnName} branch. It runs ${skillsPart}${toolsPart}, ${mode}.`;
}

import { DEPT_COUNT, type Department, type Job, START_HERE } from "./skilltree-data";

/* ============================================================
   Radial geometry — reconstructed React+SVG+math model that
   reproduces the reference layout 1:1 from its constants:

     overview wheel   W_STEP = 360/7 · R_ROOT = 310 · SPAN 140°
     drill-in fan     FAN_SPAN 182° · R0 248 · R_BASE 410 · R_STEP 214
     mini tree        r0 80 · rb 146 · rstep 56  (Rmax = rb+3·rstep)
     brain cloud      LCG seed=7 (rand = seed·16807 % 2147483647)

   Everything is world-space (origin = the Knowledge Base at the
   centre), coords rounded to 2dp so SSR and client render byte-
   identical (no React hydration mismatch).
   ============================================================ */

export const R_ROOT = 310;
export const W_STEP = 360 / DEPT_COUNT; // ≈ 51.4286°
export const WHEEL_DEFAULT = 180; // Sales at the bottom

/* overview mini-tree (source buildSky) */
const MINI = { SPAN: 140, r0: 80, rb: 146, rstep: 56, stub: 36 } as const;
const MINI_RMAX = MINI.rb + 3 * MINI.rstep; // 314
const LABEL_OFFSET = 470; // wname sits polar(470) beyond the tree root

/* drill-in fan (source buildFan) */
export const FAN = { SPAN: 182, R0: 248, R_BASE: 410, R_STEP: 214, stub: 64 } as const;
/** distance (node centre → alveolus dot), ~35px past a 74px node edge (R0 Q3). */
const LEAF_DIST = 72;

/* spokes ring radii (source: instrument rings) */
export const RINGS = [168, 236] as const;

/* badge radii in world units — a connector must KISS the solid ring border, never
   cross into the translucent interior where the icon sits.
   .sigil-badge = 76px → 38 · .fan-root = 104px → 52 (element edge, not the glow). */
export const BADGE_R = 38;
export const FAN_ROOT_R = 52;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Fixed-precision round — keeps SVG coords identical on server + client. */
export const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Pt {
  x: number;
  y: number;
}

/** polar → cartesian, a=0 points UP (matches the reference P()). */
export function polar(r: number, aDeg: number): Pt {
  const a = rad(aDeg);
  return { x: r2(r * Math.sin(a)), y: r2(-r * Math.cos(a)) };
}

const add = (a: Pt, b: Pt): Pt => ({ x: r2(a.x + b.x), y: r2(a.y + b.y) });
const seg = (a: Pt, b: Pt) => `M ${a.x} ${a.y} L ${b.x} ${b.y}`;

/** point at distance `r` from `center` toward `toward` — lands a connector on a
 *  badge's border (radius r) instead of piercing through to its centre. */
function edgePoint(center: Pt, toward: Pt, r: number): Pt {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: r2(center.x + (dx / d) * r), y: r2(center.y + (dy / d) * r) };
}

/** angle for a department index given the current wheel rotation. */
export const deptAngle = (index: number, wheelA: number): number => wheelA + index * W_STEP;

/** which department currently sits at the bottom (a = 180°). */
export function frontDeptIndex(wheelA: number): number {
  const raw = Math.round((180 - wheelA) / W_STEP);
  return ((raw % DEPT_COUNT) + DEPT_COUNT) % DEPT_COUNT;
}

/** rotation that brings department `index` to the bottom of the wheel. */
export const wheelForDept = (index: number): number => 180 - index * W_STEP;

/* ---------- overview: one department as a mini tree on the wheel ---------- */

export interface MiniJob {
  job: Job;
  pos: Pt;
  edge: string;
}
export interface MiniFn {
  id: string;
  fnDot: Pt;
  stub: string;
  jobs: MiniJob[];
}
export interface Mote {
  path: string;
  dur: number;
  begin: number;
  variant: "copper" | "line";
  r: number;
}
export interface MiniTree {
  dept: Department;
  index: number;
  deg: number;
  root: Pt;
  labelPos: Pt;
  spoke: string;
  junctions: Pt[];
  motes: Mote[];
  functions: MiniFn[];
}

/** point inside a rotated+translated mini tree (local a=0 = outward). */
function treePoint(rootDeg: number, localR: number, localAngleDeg: number): Pt {
  const root = polar(R_ROOT, rootDeg);
  const off = polar(localR, rootDeg + localAngleDeg);
  return add(root, off);
}

export function computeMiniTree(
  dept: Department,
  index: number,
  wheelA: number
): MiniTree {
  const deg = deptAngle(index, wheelA);
  const root = polar(R_ROOT, deg);
  const labelPos = polar(R_ROOT + LABEL_OFFSET, deg);

  // spoke (brain → dept anchor): stops on the badge's INNER border (radius BADGE_R
  // toward the brain) — kisses the ring, never runs under the icon. The badge itself
  // is still centred on `root` (offset 0); only the drawn endpoint is trimmed.
  const spoke = seg(polar(115, deg), edgePoint(root, polar(115, deg), BADGE_R));
  const junctions = RINGS.map((r) => polar(r, deg));
  const motes: Mote[] = [
    {
      path: seg(polar(115, deg), root),
      dur: 2.6 + (index % 3) * 0.7,
      begin: index * 0.43,
      variant: "copper",
      r: 2.4,
    },
    {
      path: seg(root, polar(115, deg)),
      dur: 3.5 + (index % 2) * 0.9,
      begin: index * 0.61 + 1.3,
      variant: "line",
      r: 1.7,
    },
  ];

  const nf = dept.functions.length;
  const fnSpan = MINI.SPAN / nf;
  let cursor = -MINI.SPAN / 2;

  const functions: MiniFn[] = dept.functions.map((fn) => {
    const aC = cursor + fnSpan / 2;
    cursor += fnSpan;

    const fnDot = treePoint(deg, MINI.r0, aC);
    // every branch is born on the badge border (not the centre) → converges at the ring
    const stub = seg(edgePoint(root, fnDot, BADGE_R), fnDot);

    const jobs = fn.jobs.length;
    let px = fnDot;
    const jobLayouts: MiniJob[] = fn.jobs.map((job, ji) => {
      const zig =
        ((ji % 2 ? 1 : -1) *
          Math.min(rad(fnSpan) * 0.22, 0.075) *
          (ji ? 1 : 0.45) *
          180) /
        Math.PI;
      const r = MINI.rb + (jobs > 1 ? (ji * (MINI_RMAX - MINI.rb)) / (jobs - 1) : 0);
      const pos = treePoint(deg, r, aC + zig);
      const edge = seg(px, pos);
      px = pos;
      return { job, pos, edge };
    });

    return { id: fn.id, fnDot, stub, jobs: jobLayouts };
  });

  return { dept, index, deg, root, labelPos, spoke, junctions, motes, functions };
}

/* ---------- drill-in: one department expanded into the big fan ---------- */

/** alveolus — one downloadable skill file, plotted as a short twig off the node. */
export interface Leaf {
  /** offset from the job-node centre (fan-local px). */
  off: Pt;
  skill: string;
}
export interface FanJob {
  job: Job;
  pos: Pt;
  edge: string;
  delay: number;
  startHere: boolean;
  /** 1 dot per skill file (max 3), fanned outward from the node (R0 Q3). */
  leaves: Leaf[];
}
export interface FanFn {
  id: string;
  fnDot: Pt;
  stub: string;
  label: { pos: Pt; name: string; count: number; delay: number };
  jobs: FanJob[];
}
export interface FanLayout {
  dept: Department;
  maxR: number;
  // bounding box of the whole fan (reference fanBounds) — used to auto-fit on drill-in.
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  arcs: string[];
  functions: FanFn[];
}

function arcPath(r: number, a0: number, a1: number): string {
  const p0 = polar(r, a0);
  const p1 = polar(r, a1);
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
}

export function computeFan(dept: Department): FanLayout {
  const total = dept.functions.reduce((s, f) => s + f.jobs.length, 0);
  const startId = START_HERE[dept.id];
  let maxR = 0;

  const arcs = [
    FAN.R0,
    FAN.R_BASE + FAN.R_STEP * 0.5,
    FAN.R_BASE + FAN.R_STEP * 2,
    FAN.R_BASE + FAN.R_STEP * 3.6,
  ].map((r) => arcPath(r, -FAN.SPAN / 2 - 3.4, FAN.SPAN / 2 + 3.4));

  let cursor = -FAN.SPAN / 2;
  const functions: FanFn[] = dept.functions.map((fn, fi) => {
    const span = (FAN.SPAN * fn.jobs.length) / total;
    const aC = cursor + span / 2;
    cursor += span;

    const fnDot = polar(FAN.R0, aC);
    // fan branches start on the fan-root's border (radius FAN_ROOT_R), not its centre
    const stub = seg(edgePoint({ x: 0, y: 0 }, fnDot, FAN_ROOT_R), fnDot);

    let px = fnDot;
    const jobs: FanJob[] = fn.jobs.map((job, ji) => {
      const zig =
        ((ji % 2 ? 1 : -1) *
          Math.min(rad(span) * 0.22, 0.075) *
          (ji ? 1 : 0.45) *
          180) /
        Math.PI;
      const r = FAN.R_BASE + ji * FAN.R_STEP;
      maxR = Math.max(maxR, r);
      const pos = polar(r, aC + zig);
      const edge = seg(px, pos);
      px = pos;
      // alveoli: 1 twig per skill file (max 3), fanned outward from the node.
      const skills = job.skills.slice(0, 3);
      const outAng = Math.atan2(pos.y, pos.x);
      const k = skills.length;
      const leaves: Leaf[] = skills.map((skill, li) => {
        const t = k === 1 ? 0 : (li / (k - 1) - 0.5) * 2; // -1..1
        const a = outAng + t * 0.5; // ±~28.6° fan around the outward radial
        return { off: { x: r2(Math.cos(a) * LEAF_DIST), y: r2(Math.sin(a) * LEAF_DIST) }, skill };
      });
      return { job, pos, edge, delay: r2(0.32 + ji * 0.12), startHere: job.id === startId, leaves };
    });

    const labelPos = polar(FAN.R_BASE + fn.jobs.length * FAN.R_STEP + 64, aC);
    return {
      id: fn.id,
      fnDot,
      stub,
      label: { pos: labelPos, name: fn.name, count: fn.jobs.length, delay: r2(0.55 + fi * 0.07) },
      jobs,
    };
  });

  // reference fanBounds: symmetric in X, opens UP so it runs from -(maxR+260) (top)
  // down to +180 (room below origin for the root badge + department name).
  return {
    dept,
    maxR,
    minX: -(maxR + 280),
    maxX: maxR + 280,
    minY: -(maxR + 260),
    maxY: 180,
    arcs,
    functions,
  };
}

/* ---------- brain cloud (central knowledge base) ---------- */

export interface BrainDot {
  x: number;
  y: number;
  r: number;
  fill: string;
  op: number;
  pulse: boolean;
  delay: number;
}
export interface BrainEdge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  op: number;
  dash: boolean;
}
export interface BrainCloud {
  dots: BrainDot[];
  edges: BrainEdge[];
  nuclei: { x: number; y: number; r: number; fill: string; nucleus: boolean }[];
}

/** the reference RNG — a deterministic LCG seeded at 7. */
function makeRand(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const BRAIN_SCALE = 1.3; // native cloud radius ~112 → ~145 on the wheel

export function buildBrain(colors: string[]): BrainCloud {
  const rand = makeRand(7);
  const S = BRAIN_SCALE;
  const dots: BrainDot[] = [];
  const edges: BrainEdge[] = [];
  // "currentColor" (não o ivory cru) porque o cérebro vive dentro do .mapview,
  // que define `color: var(--map-ivory)` — no escuro resolve o mesmo #e9e4d6 de
  // sempre, no claro vira a tinta #1b1e26 (antes o cérebro sumia no tema claro).
  const pickC = () =>
    rand() < 0.32 ? "currentColor" : colors[Math.floor(rand() * colors.length)];

  const dot = (x: number, y: number, r: number, fill: string, op: number, pulse: boolean) =>
    dots.push({
      x: r2(x * S),
      y: r2(y * S),
      r: r2(r * S),
      fill,
      op: r2(op),
      pulse,
      delay: r2(rand() * 4),
    });
  const edge = (x0: number, y0: number, x1: number, y1: number, op: number, dash = false) =>
    edges.push({
      x0: r2(x0 * S),
      y0: r2(y0 * S),
      x1: r2(x1 * S),
      y1: r2(y1 * S),
      op: r2(op),
      dash,
    });

  // free-floating memories, denser toward the centre
  for (let k = 0; k < 130; k++) {
    const a = rand() * Math.PI * 2;
    const r = 112 * Math.sqrt(rand());
    dot(r * Math.cos(a), r * Math.sin(a), 0.8 + rand() * 1.2, pickC(), 0.25 + rand() * 0.5, rand() < 0.25);
  }
  // denser rim band — the silhouette IS the circle
  for (let k = 0; k < 55; k++) {
    const a = rand() * Math.PI * 2;
    const r = 96 + rand() * 17;
    dot(r * Math.cos(a), r * Math.sin(a), 0.7 + rand() * 1, pickC(), 0.3 + rand() * 0.45, rand() < 0.2);
  }
  // two dense burst hubs — everything radiates from the cores
  const burst = (cx: number, cy: number, n: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = spread * (0.35 + rand() * 0.65);
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      edge(cx, cy, x, y, 0.16 + rand() * 0.1);
      dot(x, y, 1.1 + rand() * 1.3, pickC(), 0.55 + rand() * 0.4, rand() < 0.4);
      if (rand() < 0.32) {
        const a2 = a + (rand() - 0.5) * 0.9;
        const r2b = 8 + rand() * 11;
        const x2 = x + r2b * Math.cos(a2);
        const y2 = y + r2b * Math.sin(a2);
        edge(x, y, x2, y2, 0.12);
        dot(x2, y2, 0.9 + rand() * 0.8, pickC(), 0.35 + rand() * 0.35, false);
      }
    }
  };
  burst(-20, -15, 28, 52);
  burst(17, 19, 35, 58);
  edge(-20, -15, 17, 19, 0.16);

  // satellite constellations — small clusters gently adrift
  const centers: [number, number][] = [];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + rand() * 0.5;
    const R = 54 + rand() * 42;
    const cx = R * Math.cos(a);
    const cy = R * Math.sin(a);
    centers.push([cx, cy]);
    dot(cx, cy, 1.7 + rand(), pickC(), 0.85, false);
    const m = 5 + Math.floor(rand() * 7);
    const base = rand() * Math.PI * 2;
    const span = Math.PI * (0.7 + rand() * 1.3);
    for (let i = 0; i < m; i++) {
      const aa = base + span * (i / m) + (rand() - 0.5) * 0.2;
      const rr = 6.5 + rand() * 9;
      const x = cx + rr * Math.cos(aa);
      const y = cy + rr * Math.sin(aa);
      edge(cx, cy, x, y, 0.18);
      dot(x, y, 0.9 + rand() * 1, pickC(), 0.45 + rand() * 0.4, rand() < 0.3);
    }
  }
  // faint long-range links between distant clusters — the graph is one brain
  for (let k = 0; k < 6; k++) {
    const a = centers[Math.floor(rand() * centers.length)];
    const b = centers[Math.floor(rand() * centers.length)];
    if (a[0] !== b[0]) edge(a[0], a[1], b[0], b[1], 0.07 + rand() * 0.06, true);
  }

  const nuclei = [
    // o núcleo cobre leva a classe .brain-nucleus e o fill vem do CSS (--map-copper);
    // o outro segue a tinta do mapa via currentColor. Ambos idênticos no escuro.
    { x: r2(-20 * S), y: r2(-15 * S), r: r2(4.5 * S), fill: "#c58b5f", nucleus: true },
    { x: r2(17 * S), y: r2(19 * S), r: r2(3.4 * S), fill: "currentColor", nucleus: false },
  ];

  return { dots, edges, nuclei };
}

/* ---------- skill satellites (our extension — NOT in the reference) ----------
   When a job card opens, the job's public skill slugs fan out as small nodes on
   the OUTWARD side of the job (away from the tree centre at the origin). Pure
   world-space, so they scale with the camera exactly like the fan nodes, and the
   connectors kiss the borders (same edgePoint discipline as every other edge). */
export const SAT_ORBIT = 80; // world-px from the job-node centre to a satellite
export const SAT_ARC = 120; // degrees, fanned symmetrically about the outward axis
export const SAT_R = 5; // satellite node radius (world-px) — smaller than a job node
const JOB_NODE_R = 31; // .fan-node is 62px → radius 31 (connector starts on its border)

export interface Satellite {
  slug: string;
  pos: Pt;
  /** connector job-border → satellite-border (never crosses either node). */
  edge: string;
}

export function computeSatellites(center: Pt, slugs: string[]): Satellite[] {
  const n = slugs.length;
  if (n === 0) return [];
  // outward direction: from the tree centre (origin) toward this job node.
  const baseA = Math.atan2(center.y, center.x);
  const arc = rad(SAT_ARC);
  return slugs.map((slug, i) => {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5; // -0.5 … 0.5 across the arc
    const a = baseA + t * arc;
    const pos = {
      x: r2(center.x + SAT_ORBIT * Math.cos(a)),
      y: r2(center.y + SAT_ORBIT * Math.sin(a)),
    };
    const from = edgePoint(center, pos, JOB_NODE_R); // job border
    const to = edgePoint(pos, center, SAT_R); // satellite border, facing the job
    return { slug, pos, edge: `M ${from.x} ${from.y} L ${to.x} ${to.y}` };
  });
}

/* ---------- fit helpers ---------- */
// +210 (=990) frames the overview at ~43% (426/990) — compact, centered,
// with the reference's respiro. The only structural lever; the world layout
// (R_ROOT / R_STEP / MINI / FAN / spans) stays 1:1 with the reference.
export const OVERVIEW_REACH = R_ROOT + LABEL_OFFSET + 210; // ≈ 990
export const fanReach = (fan: FanLayout): number => fan.maxR + 200;

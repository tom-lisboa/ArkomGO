"use client";

import { memo } from "react";

import { useLocale } from "@/lib/i18n";
import { loc, DEPT_SUB_PT, deptName } from "@/lib/content-pt";
import type { BrainCloud, MiniTree } from "./geometry";
import { type Level, NODE_ZERO } from "./skilltree-data";

interface RadialGraphProps {
  miniTrees: MiniTree[];
  brain: BrainCloud;
  mode: "overview" | "dept";
  /** while a macro dive is aligning: the dept being dived into (siblings dim). */
  divingIndex: number | null;
  onSelectDept: (index: number) => void;
  onSelectHub: () => void;
  /** mostrar o rótulo de TODAS as árvores (o /map esconde a da frente porque a
   *  BottomDeptNav a repete; reusos sem essa nav — ex.: Genesis — passam true). */
  showAllLabels?: boolean;
  /** esconder TODOS os rótulos (roda nascente do Genesis: só o visual, sem texto
   *  que colida com o composer/conteúdo por cima). */
  hideLabels?: boolean;
}

const SVG_HALF = 1600;

/** node visual state per autonomy level (overview leaf dots). */
const NODE_STATE: Record<Level, string> = {
  autonomous: "deployed",
  assisted: "dev",
  manual: "plan",
};

/** atraso escalonado por (árvore, função, job) — a árvore "acende" pontinho por
 *  pontinho e cada linha traça na sua vez. Exposto via --d nos edges/jdots do
 *  overview; INERTE no /map (só o Genesis anima esses elementos com esse --d). */
const stag = (ti: number, fi: number, ji: number): number =>
  Math.round((ti * 0.22 + fi * 0.12 + ji * 0.18) * 100) / 100;

function Sigil({ inner }: { inner: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={36}
      height={36}
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="sigil-svg"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

function BrainLayer({ brain, dimmed }: { brain: BrainCloud; dimmed: boolean }) {
  return (
    <g className={`brain-drift${dimmed ? " dimmed" : ""}`}>
      <g className="brain-spin">
        {brain.edges.map((e, i) => (
          <path
            key={`be${i}`}
            d={`M ${e.x0} ${e.y0} L ${e.x1} ${e.y1}`}
            className="brain-edge"
            strokeDasharray={e.dash ? "1.5 3" : undefined}
            style={{ strokeOpacity: e.op }}
          />
        ))}
        {brain.dots.map((d, i) =>
          d.pulse ? (
            <circle
              key={`bd${i}`}
              className="brain-dot"
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill={d.fill}
              style={{ ["--d" as string]: `${d.delay}s`, opacity: d.op }}
            />
          ) : (
            <circle key={`bd${i}`} cx={d.x} cy={d.y} r={d.r} fill={d.fill} opacity={d.op} />
          )
        )}
        {brain.nuclei.map((n, i) => (
          <circle
            key={`bn${i}`}
            className={n.nucleus ? "brain-nucleus" : undefined}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={n.fill}
          />
        ))}
      </g>
    </g>
  );
}

function SpokesLayer({ trees, dimmed }: { trees: MiniTree[]; dimmed: boolean }) {
  return (
    <g className={`spokes-layer${dimmed ? " dimmed" : ""}`}>
      {[168, 236].map((r, i) => (
        <circle key={`ring${r}`} r={r} className="ring" strokeDasharray={i ? "1 6" : "2 9"} />
      ))}
      {trees.map((mt) => (
        <g key={`sp${mt.index}`}>
          <path d={mt.spoke} className="spoke" />
          {mt.junctions.map((j, k) => (
            <circle key={k} cx={j.x} cy={j.y} r={1.8} className="junction" />
          ))}
          {mt.motes.map((m, k) => (
            <circle key={k} r={m.r} className={`mote ${m.variant}`}>
              <animateMotion
                dur={`${m.dur}s`}
                begin={`${m.begin}s`}
                repeatCount="indefinite"
                path={m.path}
              />
            </circle>
          ))}
        </g>
      ))}
    </g>
  );
}

/**
 * Overview graph — the 7-department wheel: brain, spokes, mini-trees + the hub.
 * The drill-in fan lives in its own <FanStack> so it can slide independently.
 * In `dept` mode the mini-trees are UNMOUNTED (source hides the sky) so fan nodes
 * never overlap a ghost tree; the brain + spokes stay as a dim ambient core.
 */
function RadialGraphImpl({
  miniTrees,
  brain,
  mode,
  divingIndex,
  onSelectDept,
  onSelectHub,
  showAllLabels = false,
  hideLabels = false,
}: RadialGraphProps) {
  const { locale } = useLocale();
  const deptMode = mode === "dept";
  // the front (bottom-centre) department is represented by the BOTTOM nav —
  // its wheel-label is suppressed in overview so "SALES" doesn't render twice.
  const frontIdx = miniTrees.reduce(
    (a, b) => (b.root.y > a.root.y ? b : a),
    miniTrees[0]
  ).index;

  return (
    <>
      {/* ---- SVG: spokes, brain, mini-edges ---- */}
      <svg
        className="graph-svg"
        style={{ left: -SVG_HALF, top: -SVG_HALF }}
        width={SVG_HALF * 2}
        height={SVG_HALF * 2}
        viewBox={`${-SVG_HALF} ${-SVG_HALF} ${SVG_HALF * 2} ${SVG_HALF * 2}`}
        aria-hidden
      >
        <SpokesLayer trees={miniTrees} dimmed={deptMode} />
        <BrainLayer brain={brain} dimmed={deptMode} />

        {!deptMode ? (
          <g className="mini-edges">
            {miniTrees.map((mt) => (
              <g
                key={`me${mt.index}`}
                className={divingIndex !== null && mt.index !== divingIndex ? "tree-dim" : undefined}
              >
                {mt.functions.map((fl, fi) => (
                  <g key={fl.id}>
                    <path
                      d={fl.stub}
                      className="mini-edge stub"
                      style={{ ["--d" as string]: `${stag(mt.index, fi, 0)}s` }}
                    />
                    {fl.jobs.map((jl, ji) => (
                      <path
                        key={jl.job.id}
                        d={jl.edge}
                        className="mini-edge"
                        style={{ ["--d" as string]: `${stag(mt.index, fi, ji + 1)}s` }}
                      />
                    ))}
                    <circle
                      cx={fl.fnDot.x}
                      cy={fl.fnDot.y}
                      r={5}
                      fill={mt.dept.color}
                      opacity={0.9}
                    />
                  </g>
                ))}
              </g>
            ))}
          </g>
        ) : null}
      </svg>

      {/* ---- HTML: hub + mini-trees (overview only) ---- */}
      {!deptMode ? (
        <>
          <button
            type="button"
            className="hub-hit"
            aria-label={`Open ${NODE_ZERO.cardTitle} · ${NODE_ZERO.badge}`}
            onClick={onSelectHub}
          />
          <div className="hub-name">
            {loc(locale, NODE_ZERO.name, "Base de Conhecimento")}
            <div>{loc(locale, "node zero", "nó zero")}</div>
          </div>

          {miniTrees.map((mt) => {
            // M1 (Fidv3 · R0 Q1) — invisible hit-circle fitted to THIS dept's own
            // footprint (root + job dots + its label), centered on that footprint's
            // centroid. Hovering ANYWHERE in the dept's slice lights its fan and
            // fades the rest (the `.hit` "heart of the pedido"). Sized to the slice
            // — not a fat circle reaching back over the hub — so a dept never steals
            // a neighbour's area or the central hub.
            const pts: { x: number; y: number }[] = [{ x: mt.root.x, y: mt.root.y }];
            mt.functions.forEach((fl) =>
              fl.jobs.forEach((jl) => pts.push({ x: jl.pos.x, y: jl.pos.y }))
            );
            if (mt.index !== frontIdx) pts.push({ x: mt.labelPos.x, y: mt.labelPos.y });
            const xs = pts.map((p) => p.x);
            const ys = pts.map((p) => p.y);
            const hx = (Math.min(...xs) + Math.max(...xs)) / 2;
            const hy = (Math.min(...ys) + Math.max(...ys)) / 2;
            const hr = Math.max(...pts.map((p) => Math.hypot(p.x - hx, p.y - hy))) + 24;
            return (
            <div
              key={`mt${mt.index}`}
              className={`dept-group${divingIndex !== null && mt.index !== divingIndex ? " dimmed" : ""}`}
              style={{ position: "absolute", left: 0, top: 0, ["--c" as string]: mt.dept.color }}
            >
              <button
                type="button"
                className="dept-hit"
                aria-label={`Open ${mt.dept.name}`}
                onClick={() => onSelectDept(mt.index)}
                style={{ left: hx, top: hy, width: hr * 2, height: hr * 2 }}
              />
              <button
                type="button"
                className="sigil-badge"
                aria-label={`Open ${mt.dept.name}`}
                onClick={() => onSelectDept(mt.index)}
                style={{
                  left: mt.root.x,
                  top: mt.root.y,
                  ["--d" as string]: `${(mt.index * 0.12).toFixed(2)}s`,
                }}
              >
                <Sigil inner={mt.dept.sigil} />
              </button>

              {mt.functions.flatMap((fl, fi) =>
                fl.jobs.map((jl, ji) => (
                  <span
                    key={jl.job.id}
                    className={`jdot ${NODE_STATE[jl.job.level]}`}
                    style={{ left: jl.pos.x, top: jl.pos.y, ["--d" as string]: `${stag(mt.index, fi, ji + 1)}s` }}
                  />
                ))
              )}

              {!hideLabels && (showAllLabels || mt.index !== frontIdx) ? (
                <div className="mini-label" style={{ left: mt.labelPos.x, top: mt.labelPos.y }}>
                  <div className="ml-nm">{deptName(locale, mt.dept.name)}</div>
                  <div className="ml-sb">{loc(locale, mt.dept.sub, DEPT_SUB_PT[mt.dept.name])}</div>
                </div>
              ) : null}
            </div>
            );
          })}
        </>
      ) : null}
    </>
  );
}

export const RadialGraph = memo(RadialGraphImpl);

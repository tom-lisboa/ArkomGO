"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

import { useLocale } from "@/lib/i18n";
import { loc, DASH_PT, stageName, sourceName } from "@/lib/content-pt";
import { AreaChart } from "./charts";
import { Ic, Chip, type ChipVariant } from "./icons";
import {
  buildMetaPeek,
  fmt$,
  fmtN,
  type MetaState,
  type PeekData,
  type Sec,
  type SubPart,
  type BarFmtKey,
} from "./peek-data";
import { activeCampaigns } from "./meta-engine";

/* Overlay state — either a sibling list of peeks or the Meta drill coords. */
export type PeekState =
  | { mode: "list"; peeks: PeekData[]; index: number }
  | { mode: "meta"; ms: MetaState };

/* ---------- ported sparkline (SVG polyline, min/max normalized) ---------- */
function Sparkline({ vals, color }: { vals: number[]; color: string }) {
  const w = 200;
  const h = 44;
  const mx = Math.max(...vals);
  const mn = Math.min(...vals);
  const pts = vals
    .map((v, i) => {
      const x = ((i / (vals.length - 1)) * w).toFixed(1);
      const y = (h - 3 - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (h - 6)).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

const barFmt: Record<BarFmtKey, (v: number) => string> = {
  usd: fmt$,
  num: fmtN,
  x: (v) => v.toFixed(1) + "×",
  pct: (v) => v + "%",
};

function HBars({ items, max, fmt }: { items: { label: string; v: number; color: string }[]; max: number; fmt: BarFmtKey }) {
  const f = barFmt[fmt];
  return (
    <div>
      {items.map((it) => (
        <div className="hrow" key={it.label} title={`${it.label}: ${f(it.v)}`}>
          <div className="hlbl">{it.label}</div>
          <div className="htrk">
            <div
              style={{
                width: `${Math.min(100, (it.v / max) * 100).toFixed(1)}%`,
                height: "100%",
                borderRadius: "3px",
                background: `linear-gradient(90deg, color-mix(in srgb, ${it.color} 65%, transparent), ${it.color})`,
              }}
            />
          </div>
          <div className="hval">{f(it.v)}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- section renderer ---------- */
function SectionView({ sec, onDrill }: { sec: Sec; onDrill?: (d: { set?: number; ad?: string }) => void }) {
  const { locale } = useLocale();
  switch (sec.t) {
    case "pdots":
      return (
        <div className="pdots">
          {Array.from({ length: sec.total }).map((_, i) => (
            <i className={i < sec.on ? "on" : undefined} key={i} />
          ))}
          <span>{sec.label}</span>
        </div>
      );
    case "props":
      return (
        <div className="pkprops">
          {sec.items.map(([k, v]) => (
            <div className="pkprop" key={k}>
              <span>{k}</span>
              {typeof v === "string" ? sourceName(locale, v) : v}
            </div>
          ))}
        </div>
      );
    case "stats":
      return (
        <div className="pkstats" style={{ gridTemplateColumns: `repeat(${sec.cols}, minmax(0, 1fr))` }}>
          {sec.items.map((s) => (
            <div className="pkstat" key={s.l}>
              <div className="l">{s.l}</div>
              <div className="v">{s.v}</div>
            </div>
          ))}
        </div>
      );
    case "creative":
      return (
        <div className="pkcreative">
          <div className="pkcfmt">{sec.fmt}</div>
          {sec.headline ? <div className="pkchead">{sec.headline}</div> : null}
          {sec.body ? <div className="pkcbody">{sec.body}</div> : null}
        </div>
      );
    case "sig":
      return (
        <div className={`sigrow ${sec.tone}${sec.flush ? " flush" : ""}`}>
          <Ic name={sec.icon} />
          <span>
            {sec.parts.map((p, i) =>
              "chip" in p ? (
                <Chip key={i} label={p.chip.label} variant={p.chip.variant as ChipVariant} />
              ) : "b" in p ? (
                <b key={i}>{p.b}</b>
              ) : (
                <span key={i}>{p.s}</span>
              )
            )}
          </span>
        </div>
      );
    case "subhead":
      return <h4 className="pksubhead">{sec.text}</h4>;
    case "timeline":
      return (
        <div className="timeline">
          {sec.rows.map((r, i) => (
            <div className="feedrow" key={i}>
              <span className="ft">{r.time}</span>
              <span className="fb">
                {r.danger ? <span className="blocked">{r.text}</span> : r.text}
                {r.role ? <div className="fr">{r.role}</div> : null}
              </span>
            </div>
          ))}
        </div>
      );
    case "hbar":
      return (
        <div className="pkbars">
          {sec.title ? <div className="psub">{sec.title}</div> : null}
          <HBars items={sec.items} max={sec.max} fmt={sec.fmt} />
        </div>
      );
    case "spark":
      return (
        <div>
          <div className="psub">{sec.title}</div>
          <Sparkline vals={sec.vals} color={sec.color} />
          <div className="psub" style={{ marginTop: 4 }}>
            {sec.caption}
          </div>
        </div>
      );
    case "grid2":
      return (
        <div className="pkgrid2">
          <SectionView sec={sec.left} onDrill={onDrill} />
          <SectionView sec={sec.right} onDrill={onDrill} />
        </div>
      );
    case "progress":
      return (
        <div className="htrk pkprogress">
          <div className="hfill" style={{ width: `${sec.pct}%`, background: sec.danger ? "var(--pk-bad)" : "#5EEAD4" }} />
        </div>
      );
    case "area":
      return <AreaChart seedKey={sec.seedKey} color={sec.color} values={sec.values} yLabels={sec.yLabels} xLabels={sec.xLabels} height={230} />;
    case "table":
      return (
        <table className="tbl pktbl">
          {sec.head.some((h) => h.label) ? (
            <thead>
              <tr>
                {sec.head.map((h, i) => (
                  <th key={i} className={h.num ? "num" : undefined}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {sec.rows.map((row, ri) => {
              const drillable = row.drillSet != null || row.drillAd != null;
              return (
                <tr
                  key={ri}
                  className={drillable ? "rowlink" : undefined}
                  onClick={drillable && onDrill ? () => onDrill({ set: row.drillSet, ad: row.drillAd }) : undefined}
                >
                  {row.cells.map((cell, ci) => (
                    <td key={ci} className={cell.num ? "num" : undefined} style={cell.muted ? { color: "var(--mut)" } : undefined}>
                      {cell.chipLabel ? (
                        <Chip label={cell.chipLabel} variant={cell.chipVariant as ChipVariant} />
                      ) : cell.sub ? (
                        <>
                          <div className="tname">{cell.text}</div>
                          <div className="tsub">{cell.sub}</div>
                        </>
                      ) : cell.strong ? (
                        <span style={{ fontWeight: 650 }}>{cell.text}</span>
                      ) : (
                        cell.text
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      );
  }
}

/* ---------- header sub line (chips / text / clickable crumbs) ---------- */
function SubLine({ parts, onCrumb }: { parts: SubPart[]; onCrumb?: (go: "camp" | "set") => void }) {
  const { locale } = useLocale();
  return (
    <div className="pksub">
      {parts.map((p, i) =>
        "chip" in p ? (
          <Chip key={i} label={stageName(locale, p.chip)} variant={p.variant as ChipVariant} />
        ) : "crumb" in p ? (
          <a key={i} className="pkcrumb" onClick={() => onCrumb?.(p.go)}>
            {p.crumb}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </div>
  );
}

interface PeekPanelProps {
  state: PeekState;
  onChange: (s: PeekState) => void;
  onClose: () => void;
}

/**
 * The peek overlay — ported 1:1 from #peek. Renders the typed section
 * body for the current peek. Two navigation models:
 *  · list  → ‹ › cycle sibling rows (renderListPeek)
 *  · meta  → campaign → ad set → ad drill with ← pkback + crumbs (renderPeek)
 * Portaled to <body> to escape the coverflow transforms.
 */
export function PeekPanel({ state, onChange, onClose }: PeekPanelProps) {
  const { locale } = useLocale();
  const isMeta = state.mode === "meta";
  const meta = state.mode === "meta" ? buildMetaPeek(state.ms) : null;
  const data: PeekData | null = state.mode === "meta" ? meta : state.peeks[state.index];

  const metaGo = useCallback(
    (go: "camp" | "set") => {
      if (state.mode !== "meta") return;
      if (go === "camp") onChange({ mode: "meta", ms: { ...state.ms, setIdx: null, adKey: null } });
      else onChange({ mode: "meta", ms: { ...state.ms, adKey: null } });
    },
    [state, onChange]
  );

  const metaDrill = useCallback(
    (d: { set?: number; ad?: string }) => {
      if (state.mode !== "meta") return;
      if (d.set != null) onChange({ mode: "meta", ms: { ...state.ms, setIdx: d.set, adKey: null } });
      else if (d.ad != null) onChange({ mode: "meta", ms: { ...state.ms, adKey: d.ad } });
    },
    [state, onChange]
  );

  const flipCampaign = useCallback(
    (dir: 1 | -1) => {
      if (state.mode !== "meta") return;
      const actives = activeCampaigns();
      const ci = actives.findIndex((x) => x.id === state.ms.campId);
      const next = actives[(ci + dir + actives.length) % actives.length].id;
      onChange({ mode: "meta", ms: { campId: next, setIdx: null, adKey: null } });
    },
    [state, onChange]
  );

  const flipList = useCallback(
    (dir: 1 | -1) => {
      if (state.mode !== "list") return;
      onChange({ mode: "list", peeks: state.peeks, index: (state.index + dir + state.peeks.length) % state.peeks.length });
    },
    [state, onChange]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (state.mode === "list") {
        if (e.key === "ArrowLeft") flipList(-1);
        else if (e.key === "ArrowRight") flipList(1);
        return;
      }
      if (e.key === "ArrowLeft" && state.ms.adKey) metaGo("set");
      else if (e.key === "ArrowLeft" && state.ms.setIdx != null) metaGo("camp");
      else if (e.key === "ArrowLeft") flipCampaign(-1);
      else if (e.key === "ArrowRight") flipCampaign(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, flipList, flipCampaign, metaGo, onClose]);

  if (!data) return null;

  const metaLevel = meta?.level;
  const showBack = isMeta && metaLevel !== "camp";
  const showFlip = isMeta ? metaLevel === "camp" : state.mode === "list" && state.peeks.length > 1;
  const back = () => (metaLevel === "ad" ? metaGo("set") : metaGo("camp"));

  return createPortal(
    <div className="peekroot" onClick={onClose}>
      <div className="pkpanel" onClick={(e) => e.stopPropagation()}>
        <div className="pkhead">
          {showBack ? (
            <button type="button" className="pkback" aria-label="Back" onClick={back}>
              ←
            </button>
          ) : showFlip ? (
            <button type="button" className="pknav" aria-label="Previous" onClick={() => (isMeta ? flipCampaign(-1) : flipList(-1))}>
              ‹
            </button>
          ) : null}
          <h4 style={data.titlePlain ? { textTransform: "none", letterSpacing: 0, fontWeight: 600 } : undefined}>{loc(locale, data.title, DASH_PT[data.title])}</h4>
          {showFlip ? (
            <button type="button" className="pknav" aria-label="Next" onClick={() => (isMeta ? flipCampaign(1) : flipList(1))}>
              ›
            </button>
          ) : null}
          <button type="button" className="pkx" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <SubLine parts={data.sub} onCrumb={isMeta ? metaGo : undefined} />

        {data.sections.map((sec, i) => (
          <SectionView key={i} sec={sec} onDrill={isMeta ? metaDrill : undefined} />
        ))}
      </div>
    </div>,
    document.body
  );
}

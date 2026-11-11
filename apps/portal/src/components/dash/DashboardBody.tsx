"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Ic } from "./icons";
import { AreaChart, HBars, Sparkline } from "./charts";
import type { Block, Cell, Center, DataTable, Panel, Section } from "./dash-data";
import { PeekPanel, type PeekState } from "./PeekPanel";
import { buildListPeeks, isPeekable, metaEntryFromRow, metaPacingCampId } from "./peek-data";
import { useLocale } from "@/lib/i18n";
import { loc, DASH_PT, axisMonths, stageName, sourceName } from "@/lib/content-pt";
import "@/app/(aluno)/dash/peek.css";

const DEPLOY = "https://cal.com/arkom/30min";

/* DASH chrome translator (Pkg9 · 9d) — provided by DashboardBody, consumed by
   every leaf so mapped Layer-A strings render PT while data tokens pass through. */
const TrCtx = createContext<(s: string) => string>((s) => s);
const useTr = () => useContext(TrCtx);

/* ---------- row → peek plumbing (Pkg8 · verbatim peek system) ----------
   Every clickable row opens its typed peek. `openRow` resolves the clicked
   center + panel: Meta rows open the campaign→ad set→ad drill; the five
   list centers open a sibling peek list (‹ › flips rows). Null in preview. */
interface PeekApi {
  centerName: string;
  peekable: (title: string) => boolean;
  openRow: (panelTitle: string, rows: Cell[][], index: number) => void;
  openPacing: (label: string) => void;
}
const RowCtx = createContext<PeekApi | null>(null);

function cellStr(cell: Cell): string {
  switch (cell.kind) {
    case "name":
      return cell.text;
    case "text":
    case "num":
      return cell.text;
    case "chips":
      return cell.chips.map((c) => c.label).join(", ");
    case "progress":
      return `${cell.pct}%`;
  }
}

/* ---------- cell ---------- */
function CellView({ cell, accent }: { cell: Cell; accent: string }) {
  const tr = useTr();
  const { locale } = useLocale();
  switch (cell.kind) {
    case "name":
      return (
        <>
          <div className="tname">{tr(cell.text)}</div>
          <div className="tsub">{sourceName(locale, tr(cell.sub))}</div>
        </>
      );
    case "text":
      return <span>{tr(cell.text)}</span>;
    case "num":
      return <span>{tr(cell.text)}</span>;
    case "chips":
      return (
        <>
          {cell.chips.map((c, i) => (
            <span className={`chip ${c.variant}`} key={c.label + i}>
              {stageName(locale, tr(c.label))}
            </span>
          ))}
        </>
      );
    case "progress":
      return (
        <div className="htrk" title={`${cell.pct}% complete`}>
          <div className="hfill" style={{ width: `${cell.pct}%`, background: cell.danger ? "var(--bad)" : accent }} />
        </div>
      );
  }
}

function tdClass(head: { num?: boolean } | undefined, cell: Cell): string {
  const parts: string[] = [];
  if (head?.num) parts.push("num");
  if ((cell.kind === "text" || cell.kind === "num") && cell.danger) parts.push("danger");
  return parts.join(" ");
}

/* ---------- table ---------- */
function TableView({ table, accent }: { table: DataTable; accent: string }) {
  const api = useContext(RowCtx);
  const tr = useTr();
  const clickable = api ? api.peekable(table.title) : false;
  return (
    <div className="panel">
      <h3>
        <Ic name={table.icon} />
        {tr(table.title)}
      </h3>
      {table.sub ? <div className="psub">{tr(table.sub)}</div> : null}
      <table className="tbl">
        <thead>
          <tr>
            {table.head.map((h, i) => (
              <th key={h.label + i} className={h.num ? "num" : undefined}>
                {tr(h.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr
              key={ri}
              className={clickable ? "rowlink" : undefined}
              onClick={clickable && api ? () => api.openRow(table.title, table.rows, ri) : undefined}
            >
              {row.map((cell, ci) => (
                <td key={ci} className={tdClass(table.head[ci], cell)}>
                  <CellView cell={cell} accent={accent} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- section (nested inside a sections panel) ---------- */
function SectionView({ section, accent, panelTitle }: { section: Section; accent: string; panelTitle: string }) {
  const api = useContext(RowCtx);
  const tr = useTr();
  const { locale } = useLocale();
  if (section.type === "subhead") {
    return (
      <h3 className="sub2">
        {section.icon ? <Ic name={section.icon} /> : null}
        {tr(section.title ?? "")}
      </h3>
    );
  }
  if (section.type === "bars" && section.bars) {
    // overlay chart-category labels through DASH_PT (P6) then the CRM stage map
    // (N1); labels absent from both fall back to EN, so demo/brand labels are safe.
    const bars = section.bars.map((b) => ({ ...b, label: stageName(locale, tr(b.label)) }));
    return <HBars bars={bars} fmt={section.fmt ?? "num"} max={section.max} />;
  }
  if (section.type === "table" && section.head && section.rows) {
    const title = section.title ?? panelTitle;
    const clickable = api ? api.peekable(title) : false;
    return (
      <table className="tbl" style={{ fontSize: "11.5px" }}>
        <thead>
          <tr>
            {section.head.map((h, i) => (
              <th key={h.label + i} className={h.num ? "num" : undefined}>
                {tr(h.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, ri) => (
            <tr
              key={ri}
              className={clickable ? "rowlink" : undefined}
              onClick={clickable && api && section.rows ? () => api.openRow(title, section.rows!, ri) : undefined}
            >
              {row.map((cell, ci) => (
                <td key={ci} className={tdClass(section.head?.[ci], cell)}>
                  <CellView cell={cell} accent={accent} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}

/* ---------- panel ---------- */
function PanelView({ panel, accent, previewSeedSuffix }: { panel: Panel; accent: string; previewSeedSuffix: string }) {
  const api = useContext(RowCtx);
  const tr = useTr();
  const { locale } = useLocale();
  switch (panel.kind) {
    case "area":
      return (
        <div className="panel">
          <h3>
            <Ic name={panel.icon} />
            {tr(panel.title)}
          </h3>
          {panel.sub ? <div className="psub">{tr(panel.sub)}</div> : null}
          <AreaChart
            seedKey={panel.seedKey + previewSeedSuffix}
            color={accent}
            yLabels={panel.yLabels}
            xLabels={panel.xLabels.map((l) => axisMonths(locale, l))}
            height={panel.height}
            values={panel.values}
          />
          {panel.legend ? (
            <div className="legend">
              {panel.legend.map((l) => (
                <span key={l.label}>
                  <i style={{ background: l.color }} />
                  {tr(l.label)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    case "sections":
      return (
        <div className="panel">
          {panel.title ? (
            <h3>
              {panel.icon ? <Ic name={panel.icon} /> : null}
              {tr(panel.title)}
            </h3>
          ) : null}
          {panel.sub ? <div className="psub">{tr(panel.sub)}</div> : null}
          {panel.sections.map((s, i) => (
            <SectionView key={i} section={s} accent={accent} panelTitle={panel.title ?? ""} />
          ))}
        </div>
      );
    case "table":
      return <TableView table={panel} accent={accent} />;
    case "pacing":
      return (
        <div className="panel">
          <h3>
            <Ic name={panel.icon} />
            {tr(panel.title)}
          </h3>
          {panel.sub ? <div className="psub">{tr(panel.sub)}</div> : null}
          {panel.rows.map((r) => (
            <div
              className={`pacerow${api ? " rowlink" : ""}`}
              key={r.label}
              onClick={api ? () => api.openPacing(r.label) : undefined}
            >
              <div>
                <div className="plbl">{tr(r.label)}</div>
                <div className="ptrk">
                  <div className="pfill" style={{ width: `${Math.min(100, r.pct)}%` }} />
                </div>
              </div>
              <span className={`chip ${r.variant}`}>
                {r.pct}% {tr(r.state)}
              </span>
            </div>
          ))}
        </div>
      );
    case "feed":
      return (
        <div className="panel">
          <h3>
            <Ic name={panel.icon} />
            {tr(panel.title)}
          </h3>
          {panel.sub ? <div className="psub">{tr(panel.sub)}</div> : null}
          {panel.rows.map((r, i) => (
            <div className="feedrow" key={i}>
              <span className="ft">{r.time}</span>
              <span className="fb">
                {tr(r.text)}
                <div className="fr">{tr(r.role)}</div>
              </span>
            </div>
          ))}
        </div>
      );
  }
}

/* ---------- block ---------- */
function BlockView({ block, accent, previewSeedSuffix }: { block: Block; accent: string; previewSeedSuffix: string }): ReactNode {
  const tr = useTr();
  switch (block.type) {
    case "kpis":
      return (
        <div className="kpis">
          {block.items.map((k) => (
            <div className="kpi" key={k.label}>
              <div className="khead">
                <div className="klabel">
                  <Ic name={k.icon} />
                  <span className="klabeltxt" title={tr(k.label)}>{tr(k.label)}</span>
                </div>
                {k.badge ? <div className={`kbadge ${k.badge.up ? "" : "down"}`}>{(k.badge.up ? "↗ " : "↘ ") + tr(k.badge.txt)}</div> : null}
              </div>
              <div className="kval">{tr(k.value)}</div>
              {k.foot ? <div className="kfoot">{tr(k.foot)}</div> : null}
              {k.spark ? <Sparkline seedKey={k.label + previewSeedSuffix} color={accent} values={k.sparkValues} /> : null}
            </div>
          ))}
        </div>
      );
    case "signals":
      return (
        <div className="panel">
          <h3>
            <Ic name="zap" />
            {tr("Signals")}
          </h3>
          <div className="sig3">
            {block.items.map((s, i) => (
              <div className={`sigrow ${s.tone}`} key={i}>
                <Ic name={s.icon} />
                <span>
                  <b>{tr(s.lead)}</b>
                  {s.rest ? tr(s.rest) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    case "row":
      return (
        <div className={`panelrow ${block.ratio === "1:2" ? "rev" : block.ratio === "1:1" ? "even" : ""}`.trim()}>
          <PanelView panel={block.left} accent={accent} previewSeedSuffix={previewSeedSuffix} />
          <PanelView panel={block.right} accent={accent} previewSeedSuffix={previewSeedSuffix} />
        </div>
      );
    case "panel":
      return <PanelView panel={block.panel} accent={accent} previewSeedSuffix={previewSeedSuffix} />;
  }
}

/**
 * Renders the interior of a command center (KPIs → signals → panels → tables).
 * `preview` renders the same body statically for the coverflow card face.
 */
export function DashboardBody({ center, preview = false }: { center: Center; preview?: boolean }) {
  const accent = center.color;
  const suffix = preview ? "-p" : "";
  const { locale } = useLocale();
  const tr = useCallback((s: string) => loc(locale, s, DASH_PT[s]), [locale]);
  const [peek, setPeek] = useState<PeekState | null>(null);

  const openRow = useCallback(
    (panelTitle: string, rows: Cell[][], index: number) => {
      const firstCells = rows.map((r) => cellStr(r[0]));
      if (center.id === "meta") {
        const entry = metaEntryFromRow(panelTitle, firstCells[index]);
        if (entry) setPeek({ mode: "meta", ms: entry });
        return;
      }
      const res = buildListPeeks(center.name, firstCells, index);
      if (res) setPeek({ mode: "list", peeks: res.peeks, index: res.index });
    },
    [center.id, center.name]
  );

  const openPacing = useCallback((label: string) => {
    const campId = metaPacingCampId(label);
    if (campId) setPeek({ mode: "meta", ms: { campId, setIdx: null, adKey: null } });
  }, []);

  const api = useMemo<PeekApi | null>(
    () => (preview ? null : { centerName: center.name, peekable: (t) => isPeekable(center.name, t), openRow, openPacing }),
    [preview, center.name, openRow, openPacing]
  );

  return (
    <TrCtx.Provider value={tr}>
      <RowCtx.Provider value={api}>
        {center.blocks.map((b, i) => (
          <BlockView key={i} block={b} accent={accent} previewSeedSuffix={suffix} />
        ))}
        {!preview ? (
          <div className="dcta">
            <div>
              <b>{tr(center.cta.title)}</b>
              <p>{tr(center.cta.text)}</p>
            </div>
            <a href={DEPLOY} target="_blank" rel="noopener noreferrer">
              {tr("Get this deployed →")}
            </a>
          </div>
        ) : null}
        {peek ? <PeekPanel state={peek} onChange={setPeek} onClose={() => setPeek(null)} /> : null}
      </RowCtx.Provider>
    </TrCtx.Provider>
  );
}

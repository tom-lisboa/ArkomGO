/* Deterministic chart primitives — no Math.random / Date, so server
   and client render identically (SSR-safe). Bars/tables carry the real
   exposed numbers; the smooth area/spark shapes are decorative and are
   generated from a fixed seed. */

/** mulberry32 — tiny deterministic PRNG seeded by an integer. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Smooth-ish series of `n` values in [0,1] driven by two waves + jitter. */
function wave(seed: number, n: number): number[] {
  const rnd = seeded(seed);
  const p1 = 2 + rnd() * 3;
  const p2 = 4 + rnd() * 5;
  const ph = rnd() * Math.PI * 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const v =
      0.5 +
      0.28 * Math.sin(t * Math.PI * p1 + ph) +
      0.16 * Math.sin(t * Math.PI * p2) +
      (rnd() - 0.5) * 0.14;
    out.push(Math.max(0.04, Math.min(0.98, v)));
  }
  return out;
}

/* ---------- formatters ---------- */
export const fmtUsd = (v: number) => "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmtNum = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmtPct = (v: number) => v + "%";
export const fmtBrl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export type BarFmt = "usd" | "num" | "pct" | "brl";
export const fmtBy = (fmt: BarFmt): ((v: number) => string) =>
  fmt === "usd" ? fmtUsd : fmt === "pct" ? fmtPct : fmt === "brl" ? fmtBrl : fmtNum;

/* ---------- Sparkline (KPI corner) ---------- */
export function Sparkline({ seedKey, color, values }: { seedKey: string; color: string; values?: number[] }) {
  const w = 56;
  const h = 18;
  const vals = values && values.length > 1 ? values : wave(hashSeed(seedKey), 24);
  const pts = vals
    .map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 2 - v * (h - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="kspark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

/* ---------- Big area chart (Spend / Revenue / Views / Sends) ---------- */
export interface AreaChartProps {
  seedKey: string;
  color: string;
  yLabels: string[]; // top → bottom
  xLabels: string[];
  height?: number;
  values?: number[]; // explicit series (0..1 normalized); overrides the decorative wave
}

export function AreaChart({ seedKey, color, yLabels, xLabels, height = 240, values }: AreaChartProps) {
  const W = 820;
  const H = height;
  const PL = 44;
  const PB = 26;
  const PT = 12;
  const n = values ? values.length : 30;
  const vals = values ?? wave(hashSeed(seedKey), n);
  const X = (i: number) => PL + (i / (n - 1)) * (W - PL - 10);
  const Y = (v: number) => PT + (1 - v) * (H - PB - PT);
  const gid = "ag-" + hashSeed(seedKey).toString(36);

  const line = vals.map((v, i) => `${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" L ");
  const path = "M " + line;
  const area = `${path} L ${X(n - 1).toFixed(1)} ${H - PB} L ${X(0).toFixed(1)} ${H - PB} Z`;

  // horizontal gridlines aligned to the y labels
  const rows = yLabels.length;
  const gridY = (idx: number) => PT + (idx / (rows - 1)) * (H - PB - PT);

  return (
    <div className="chart" style={{ marginTop: 14 }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.32" />
            <stop offset="1" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yLabels.map((lb, i) => (
          <g key={lb + i}>
            <line x1={PL} y1={gridY(i)} x2={W - 10} y2={gridY(i)} stroke="rgb(var(--lnrgb))" strokeOpacity="0.06" strokeWidth="1" />
            <text x={PL - 8} y={gridY(i) + 3} fontSize="9" fill="var(--ink-3)" textAnchor="end">
              {lb}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {xLabels.map((lb, i) => (
          <text
            key={lb + i}
            x={PL + (i / (xLabels.length - 1)) * (W - PL - 10)}
            y={H - 8}
            fontSize="8.5"
            fill="var(--ink-3)"
            textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
          >
            {lb}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ---------- Horizontal bar list ---------- */
export interface HBar {
  label: string;
  value: number;
  color?: string;
}

export function HBars({ bars, fmt, max }: { bars: HBar[]; fmt: BarFmt; max?: number }) {
  const f = fmtBy(fmt);
  const top = max ?? Math.max(...bars.map((b) => b.value), 1);
  return (
    <div>
      {bars.map((b) => {
        const c = b.color ?? "var(--a)";
        return (
          <div className="hrow" key={b.label} title={`${b.label}: ${f(b.value)}`}>
            <div className="hlbl">{b.label}</div>
            <div className="htrk">
              <div
                className="hfill"
                style={{
                  width: `${((b.value / top) * 100).toFixed(1)}%`,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${c} 65%, transparent), ${c})`,
                }}
              />
            </div>
            <div className="hval">{f(b.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

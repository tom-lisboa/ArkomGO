/* ============================================================
   Reactive Meta Ads center (Pkg11 · M2). The static `meta` snapshot
   in dash-data.ts is the 30d photograph; this rebuilds the SAME center
   for ANY range by running the ported engine (meta-engine.ts) — the
   verbatim source `buildMeta` math. Every number here is engine-derived
   (genDays→rollup→kpisOf, seed 20260611); editorial labels/copy are the
   source's own strings. Verified to reproduce the 30d snapshot exactly
   (spend $31,587 · 1,049 leads · $30.12 CPL) and react at 7/14/90d.
   ============================================================ */

import type { IconKey } from "./icons";
import type { Block, Cell, Center, ChipSpec } from "./dash-data";
import {
  AD_LIB,
  ADSETS,
  CAMPAIGNS,
  type Campaign,
  kpisOf,
  rollup,
  activeCampaigns,
  type Day,
} from "./meta-engine";

/* ---- local Cell builders (mirror dash-data helpers) ---- */
const nm = (text: string, sub: string): Cell => ({ kind: "name", text, sub });
const nu = (text: string): Cell => ({ kind: "num", text });
const cp = (chips: ChipSpec[]): Cell => ({ kind: "chips", chips });

const ACCENT = "var(--a)";

/* ---- formatters (verbatim source presentation) ---- */
const usd0 = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
const num0 = (v: number) => Math.round(v).toLocaleString("en-US");
const usd2 = (v: number) => "$" + v.toFixed(2);
const pct2 = (v: number) => v.toFixed(2) + "%";

const parseRange = (r: string): number => parseInt(r, 10) || 30;

/* ---- daily metric extractors (for spark + area series) ---- */
type MetricKey = "spend" | "leads" | "cpl" | "ctr" | "cpm" | "freq";
const dayMetric = (r: Day, key: MetricKey): number => {
  switch (key) {
    case "spend": return r.spend;
    case "leads": return r.leads;
    case "cpl": return r.leads > 0 ? r.spend / r.leads : 0;
    case "ctr": return r.imp > 0 ? (r.lclk / r.imp) * 100 : 0;
    case "cpm": return r.imp > 0 ? (r.spend / r.imp) * 1000 : 0;
    case "freq": return r.reach > 0 ? r.imp / r.reach : 0;
  }
};
/** min-max normalize a line series to 0..1 (last 30 points, like source sp()). */
const normLine = (vals: number[]): number[] => {
  const s = vals.slice(-30);
  const mn = Math.min(...s), mx = Math.max(...s), d = mx - mn || 1;
  return s.map((v) => (v - mn) / d);
};

/* ---- KPI scaffold: source copy + polarity (↑ = "up/good"?) ---- */
interface KpiMeta { icon: IconKey; label: string; foot: string; key: MetricKey; inverse: boolean; fmt: (v: number) => string; }
const KPI_META: KpiMeta[] = [
  { icon: "dollar", label: "Total Spend", foot: "Trending up ↗", key: "spend", inverse: false, fmt: usd0 },
  { icon: "users", label: "Leads", foot: "Holding strong ↗", key: "leads", inverse: false, fmt: num0 },
  { icon: "target", label: "Cost per Lead", foot: "Creeping up ↘", key: "cpl", inverse: true, fmt: usd2 },
  { icon: "click", label: "Link CTR", foot: "Creative softening ↘", key: "ctr", inverse: false, fmt: pct2 },
  { icon: "eye", label: "CPM", foot: "Auction normal", key: "cpm", inverse: true, fmt: usd2 },
  { icon: "repeat", label: "Frequency", foot: "Room to scale ↗", key: "freq", inverse: true, fmt: (v) => v.toFixed(2) },
];

/* ---- placement / age split shares (source fixed weights) ---- */
const PLACEMENTS: [string, number][] = [
  ["Instagram Reels", 0.34], ["Facebook Feed", 0.27], ["Instagram Feed", 0.18],
  ["Instagram Stories", 0.12], ["Audience Network", 0.05], ["Marketplace", 0.04],
];
const AGES: [string, number][] = [
  ["25–34", 0.31], ["35–44", 0.34], ["45–54", 0.22], ["55–64", 0.09], ["18–24", 0.04],
];

/* ---- pacing short labels (source copy, per active campaign) ---- */
const PACING_LABEL: Record<string, string> = {
  "120210871104": "Logistics SaaS",
  "120210944167": "Recruitment Agencies",
  "120211020433": "Engagers 30d + LAL1",
  "120211098801": "Property Mgmt",
  "120211134890": "Broad Adv+",
};

const qVariant = (q: string): ChipSpec["variant"] =>
  q === "Above average" ? "quality" : q === "Below average" ? "fatigue" : "qavg";

/* ---- per-ad leaderboard aggregation (verbatim source split) ---- */
interface AdAgg { key: string; spend: number; leads: number; camps: Set<string>; }
function leaderboard(days: number): AdAgg[] {
  const agg: Record<string, AdAgg> = {};
  activeCampaigns().forEach((c) => {
    const ck = kpisOf(rollup([c.id], days));
    const sets = ADSETS[c.id] || [];
    const totB = sets.reduce((a, b) => a + b.budget, 0);
    sets.forEach((s) => {
      const share = s.budget / totB;
      const shSum = s.ads.reduce((a, k) => a + AD_LIB[k].share, 0);
      s.ads.forEach((k) => {
        const lib = AD_LIB[k];
        const sh = lib.share / shSum;
        if (!agg[k]) agg[k] = { key: k, spend: 0, leads: 0, camps: new Set() };
        agg[k].spend += ck.spend * share * sh;
        agg[k].leads += ck.leads * share * s.mult * sh * lib.mult;
        agg[k].camps.add(c.id);
      });
    });
  });
  return Object.values(agg).sort((a, b) => a.spend / a.leads - b.spend / b.leads);
}

/* ---- campaign delivery chips + descriptive sub ---- */
const deliveryChips = (c: Campaign): ChipSpec[] => {
  if (c.status === "PAUSED") return [{ label: "Paused", variant: "paused" }];
  const chips: ChipSpec[] = [{ label: "Active", variant: "active" }];
  if (c.fatigue) chips.push({ label: "Fatigue", variant: "fatigue" });
  if (c.learning) chips.push({ label: "Learning", variant: "learning" });
  return chips;
};
const campSub = (c: Campaign): string => {
  const obj = c.objective === "OUTCOME_AWARENESS" ? "awareness" : "leads";
  return `${obj} · ${c.bid.toLowerCase()} · since ${c.started}`;
};

/* ---- area axis ticks from real daily spend ---- */
const yTick = (v: number): string => (v >= 1000 ? "$" + (v / 1000).toFixed(1) + "k" : "$" + Math.round(v));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 7 evenly-spaced date ticks over the trailing `days` window (anchor 11 Jun 2026). */
function areaXLabels(days: number): string[] {
  const anchor = new Date(2026, 5, 11); // newest data day (rollup ends here)
  const out: string[] = [];
  for (let t = 0; t < 7; t++) {
    const back = Math.round((days - 1) * (1 - t / 6));
    const d = new Date(anchor);
    d.setDate(d.getDate() - back);
    out.push(`${MONTHS[d.getMonth()]} ${d.getDate()}`);
  }
  return out;
}

/**
 * Rebuild the Meta center for a given range, all numbers engine-derived.
 * `base` supplies the invariant chrome (name, guide, cta, tools, ranges).
 */
export function buildMetaCenter(rangeStr: string, base: Center): Center {
  const range = parseRange(rangeStr);
  const activeIds = activeCampaigns().map((c) => c.id);

  const cur = kpisOf(rollup(activeIds, range));
  const prevRows = rollup(activeIds, range * 2).slice(0, range);
  const prev = kpisOf(prevRows);

  const curVal: Record<MetricKey, number> = { spend: cur.spend, leads: cur.leads, cpl: cur.cpl, ctr: cur.ctr, cpm: cur.cpm, freq: cur.freq };
  const prevVal: Record<MetricKey, number> = { spend: prev.spend, leads: prev.leads, cpl: prev.cpl, ctr: prev.ctr, cpm: prev.cpm, freq: prev.freq };

  // per-day rows once (spark + area series)
  const rows = rollup(activeIds, range);

  /* ---- KPI tiles ---- */
  const kpis: Block = {
    type: "kpis",
    items: KPI_META.map((m) => {
      const c = curVal[m.key], p = prevVal[m.key];
      const delta = p ? ((c - p) / p) * 100 : 0;
      const up = m.inverse ? delta < 0 : delta > 0;
      const txt = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
      return {
        icon: m.icon,
        label: m.label,
        value: m.fmt(c),
        badge: { up, txt },
        foot: m.foot,
        spark: true,
        sparkValues: normLine(rows.map((r) => dayMetric(r, m.key))),
      };
    }),
  };

  /* ---- signals (source editorial; signal 0 freq is live) ---- */
  const engFreq = kpisOf(rollup(["120211020433"], range)).freq;
  const signals: Block = {
    type: "signals",
    items: [
      { tone: "warn", icon: "alert", lead: `RT | Engagers frequency at ${engFreq.toFixed(1)}`, rest: " and CPL up 28% in 14d · two fresh creatives queued, rotate before Thursday's budget step-up." },
      { tone: "good", icon: "check", lead: "LAL 1% Closed-Won beats the interest stack on CPL by 31%", rest: " · third straight month. Shift $40/day from INT · Freight." },
      { tone: "info", icon: "target", lead: "LAL 2% Guide-downloads is Learning Limited", rest: " · 38 conv/wk vs the 50 it needs. Consolidate into the 1% set or widen geo." },
    ],
  };

  /* ---- area + placement/age split ---- */
  const spendSeries = rows.map((r) => r.spend);
  const peak = Math.max(...spendSeries, 1);
  const areaRow: Block = {
    type: "row",
    ratio: "2:1",
    left: {
      kind: "area",
      icon: "trend",
      title: "Spend & cost per lead",
      sub: `Daily spend, cost per lead overlaid · last ${range} days`,
      seedKey: "meta-spend",
      yLabels: [yTick(peak), yTick((peak * 2) / 3), yTick(peak / 3), "$0"],
      xLabels: areaXLabels(range),
      values: spendSeries.map((v) => Math.max(0.02, v / peak)),
      legend: [
        { label: "spend", color: "var(--a)" },
        { label: "cost per lead", color: "var(--mut)" },
      ],
    },
    right: {
      kind: "sections",
      icon: "grid",
      title: "Spend by placement",
      sections: [
        { type: "bars", fmt: "usd", bars: PLACEMENTS.map(([label, sh]) => ({ label, value: Math.round(cur.spend * sh), color: ACCENT })) },
        { type: "subhead", icon: "users", title: "Leads by age" },
        { type: "bars", fmt: "num", bars: AGES.map(([label, sh]) => ({ label, value: Math.round(cur.leads * sh), color: ACCENT })) },
      ],
    },
  };

  /* ---- pacing (trailing min(range,14)) + creative leaderboard ---- */
  const pWin = Math.min(range, 14);
  const pacingRow: Block = {
    type: "row",
    ratio: "1:2",
    left: {
      kind: "pacing",
      icon: "target",
      title: "Budget pacing",
      sub: `Average daily delivery vs set budget · trailing ${pWin}d`,
      rows: activeCampaigns().map((c) => {
        const k = kpisOf(rollup([c.id], pWin));
        const pct = Math.round((k.spend / pWin) / c.budget * 100);
        return c.learning
          ? { label: PACING_LABEL[c.id], pct, state: "Learning", variant: "learning" as const }
          : { label: PACING_LABEL[c.id], pct, state: "On pace", variant: "active" as const };
      }),
    },
    right: {
      kind: "table",
      icon: "play",
      title: "Creative leaderboard",
      sub: "Every live creative, ranked by CPL · aggregated across campaigns",
      head: [
        { label: "Creative" }, { label: "Quality" }, { label: "Thumbstop", num: true },
        { label: "Hook", num: true }, { label: "Spend", num: true }, { label: "Leads", num: true }, { label: "CPL", num: true },
      ],
      rows: leaderboard(range).map((a) => {
        const lib = AD_LIB[a.key];
        const n = a.camps.size;
        return [
          nm(lib.name, `${lib.fmt} · in ${n} campaign${n > 1 ? "s" : ""}`),
          cp([{ label: lib.q, variant: qVariant(lib.q) }]),
          nu(lib.ts.toFixed(1) + "%"),
          nu(lib.hook > 0 ? lib.hook.toFixed(1) + "%" : "—"),
          nu(usd0(a.spend)),
          nu(num0(a.leads)),
          nu(usd2(a.spend / a.leads)),
        ];
      }),
    },
  };

  /* ---- campaigns table (all 7, sorted by range spend desc) ---- */
  const campRows = CAMPAIGNS
    .map((c) => ({ c, k: kpisOf(rollup([c.id], range)) }))
    .sort((x, y) => y.k.spend - x.k.spend)
    .map(({ c, k }): Cell[] => {
      const hasData = k.spend > 0;
      return [
        nm(c.name, campSub(c)),
        cp(deliveryChips(c)),
        nu(c.status === "PAUSED" ? "—" : `$${c.budget}/d`),
        nu(usd0(k.spend)),
        nu(hasData ? num0(k.leads) : "0"),
        nu(hasData && k.leads > 0 ? usd2(k.cpl) : "—"),
        nu(hasData ? pct2(k.ctr) : "—"),
        nu(hasData ? k.freq.toFixed(2) : "—"),
      ];
    });
  const nActive = activeIds.length;
  const campaigns: Block = {
    type: "panel",
    panel: {
      kind: "table",
      icon: "mega",
      title: "Campaigns",
      sub: `${nActive} active · ${CAMPAIGNS.length} total · sorted by spend`,
      head: [
        { label: "Campaign" }, { label: "Delivery" }, { label: "Budget", num: true },
        { label: "Spend", num: true }, { label: "Leads", num: true }, { label: "CPL", num: true },
        { label: "CTR", num: true }, { label: "Freq", num: true },
      ],
      rows: campRows,
    },
  };

  return { ...base, blocks: [kpis, signals, areaRow, pacingRow, campaigns] };
}

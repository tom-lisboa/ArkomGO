/* ============================================================
   Meta Ads engine — ported 1:1 from dash_index.html (buildMeta +
   renderPeek data path). Deterministic seeded simulation so the
   campaign → ad set → ad drill produces the exact numbers the
   dashboard tables show. Zero invented values: CAMPAIGNS / AD_LIB /
   ADSETS and the genDays/rollup/kpisOf math are verbatim.
   ============================================================ */

export const RANGE = 30; // default range (source: `let range = 30`)

/* ---- seeded LCG (source: seed=20260611, rand = park-miller) ---- */
let seed = 20260611;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: "ACTIVE" | "PAUSED";
  budget: number;
  budgetType: string;
  bid: string;
  started: string;
  base: number;
  cpm: [number, number];
  lctr: [number, number];
  cvr: [number, number];
  learning: boolean;
  fatigue?: boolean;
  endAgo?: number;
}

export const CAMPAIGNS: Campaign[] = [
  { id: "120210871104", name: "LG | Logistics SaaS | US | Lead Form | CBO", objective: "OUTCOME_LEADS", status: "ACTIVE", budget: 410, budgetType: "CBO · daily", bid: "Highest volume", started: "14 Apr 2026", base: 410, cpm: [27, 41], lctr: [0.85, 1.15], cvr: [0.115, 0.16], learning: false },
  { id: "120210944167", name: "LG | Recruitment Agencies | US/CA | Whitepaper | ABO", objective: "OUTCOME_LEADS", status: "ACTIVE", budget: 290, budgetType: "ABO · daily", bid: "Highest volume", started: "28 Apr 2026", base: 290, cpm: [31, 46], lctr: [0.65, 0.95], cvr: [0.09, 0.13], learning: false },
  { id: "120211020433", name: "RT | Engagers 30d + LAL1 | Book-a-Call | ABO", objective: "OUTCOME_LEADS", status: "ACTIVE", budget: 150, budgetType: "ABO · daily", bid: "Cost per result · $24 cap", started: "02 Mar 2026", base: 150, cpm: [48, 78], lctr: [1.3, 1.9], cvr: [0.17, 0.24], learning: false, fatigue: true },
  { id: "120211098801", name: "LG | Property Mgmt | AU/NZ | Case Study | ABO", objective: "OUTCOME_LEADS", status: "ACTIVE", budget: 120, budgetType: "ABO · daily", bid: "Highest volume", started: "29 May 2026", base: 120, cpm: [29, 44], lctr: [0.55, 0.9], cvr: [0.08, 0.12], learning: true },
  { id: "120211134890", name: "TOF | Broad Adv+ | US | Lead Form | CBO", objective: "OUTCOME_LEADS", status: "ACTIVE", budget: 80, budgetType: "CBO · daily", bid: "Highest volume", started: "04 Jun 2026", base: 80, cpm: [22, 33], lctr: [0.7, 1.0], cvr: [0.07, 0.1], learning: true },
  { id: "120209831914", name: "BR | Founder Reels | Broad | Reach", objective: "OUTCOME_AWARENESS", status: "PAUSED", budget: 0, budgetType: "CBO · daily", bid: "Highest volume", started: "11 Feb 2026", base: 60, endAgo: 12, cpm: [12, 19], lctr: [0.4, 0.7], cvr: [0.015, 0.03], learning: false },
  { id: "120208604277", name: "[z] LG | Dental Groups | US | Lead Form (Q1)", objective: "OUTCOME_LEADS", status: "PAUSED", budget: 0, budgetType: "ABO · daily", bid: "Highest volume", started: "08 Jan 2026", base: 0, cpm: [30, 45], lctr: [0.6, 0.9], cvr: [0.08, 0.11], learning: false },
];

export interface Ad {
  name: string;
  fmt: string;
  share: number;
  mult: number;
  q: string;
  hook: number;
  hold: number;
  ts: number;
  headline: string;
  primary: string;
  cta: string;
}

export const AD_LIB: Record<string, Ad> = {
  v1: { name: "VID_founder-hook-03_costcut_0524", fmt: "Video · 9:16 · 0:34", share: 0.42, mult: 1.18, q: "Above average", hook: 34.2, hold: 16.8, ts: 28.4, headline: "Cut invoice processing time 80%", primary: "Your AP team keys the same 12 fields out of every freight invoice. We watched one do 240 in a day — an extraction agent does it in 11 minutes at 97% accuracy…", cta: "Learn more" },
  v2: { name: "VID_founder-hook-07_headcount_0517", fmt: "Video · 9:16 · 0:41", share: 0.31, mult: 1.04, q: "Above average", hook: 29.8, hold: 13.1, ts: 24.6, headline: "The back office that runs itself", primary: "Nobody quits over interesting work. They quit over re-keying invoices. Here’s how three ops teams reassigned their best people…", cta: "Learn more" },
  s1: { name: "STA_case-study-card_results_0510", fmt: "Static · 1:1", share: 0.17, mult: 0.84, q: "Average", hook: 0, hold: 0, ts: 11.2, headline: "11,400 invoices · 97.2% accuracy", primary: "Case study: how a national logistics group cleared a 6-week AP backlog in 9 days.", cta: "Download" },
  c1: { name: "CAR_5-jobs-to-automate_v2_0428", fmt: "Carousel · 5 cards", share: 0.10, mult: 0.71, q: "Below average", hook: 0, hold: 0, ts: 8.9, headline: "5 ops jobs you can hand to an agent", primary: "Swipe: the five back-office jobs teams automate first — and what each one costs to keep manual.", cta: "Learn more" },
  v3: { name: "VID_screenrec-demo-01_speed_0601", fmt: "Video · 4:5 · 0:52", share: 0.55, mult: 1.11, q: "Above average", hook: 31.5, hold: 18.9, ts: 26.1, headline: "Watch a 240-invoice batch process live", primary: "No talking head. Just the queue draining: 240 freight invoices → checked, coded, posted. 11 minutes, one approval.", cta: "Book now" },
  v4: { name: "VID_ugc-style-02_whitepaper_0522", fmt: "Video · 9:16 · 0:28", share: 0.45, mult: 0.93, q: "Average", hook: 26.3, hold: 11.4, ts: 21.8, headline: "The 2026 placement-automation report", primary: "60 recruitment agencies told us where automation actually stuck. The numbers on sourcing vs admin surprised us…", cta: "Download" },
};

export interface AdSet {
  name: string;
  budget: number;
  learn: string;
  opt: string;
  attr: string;
  aud: string;
  mult: number;
  ads: string[];
}

export const ADSETS: Record<string, AdSet[]> = {
  "120210871104": [
    { name: "LAL 1% · Closed-Won 180d | US | 28-55", budget: 180, learn: "Active", opt: "Leads · lead form", attr: "7-day click · 1-day view", aud: "2.1M", mult: 1.0, ads: ["v1", "v2", "s1", "c1"] },
    { name: "INT · Freight + Supply Chain stack | US | 28-55", budget: 140, learn: "Active", opt: "Leads · lead form", attr: "7-day click · 1-day view", aud: "4.8M", mult: 0.86, ads: ["v1", "s1", "c1"] },
    { name: "BROAD · Advantage+ audience | US", budget: 90, learn: "Active", opt: "Leads · lead form", attr: "7-day click · 1-day view", aud: "Advantage+", mult: 1.12, ads: ["v1", "v2"] },
  ],
  "120210944167": [
    { name: "INT · Agency owners + directors | US/CA | 30-60", budget: 170, learn: "Active", opt: "Leads · instant form", attr: "7-day click · 1-day view", aud: "1.9M", mult: 1.0, ads: ["v4", "s1"] },
    { name: "LAL 2% · Guide downloads 90d | US/CA", budget: 120, learn: "Limited", opt: "Leads · instant form", attr: "7-day click · 1-day view", aud: "3.4M", mult: 0.81, ads: ["v4", "c1"] },
  ],
  "120211020433": [
    { name: "ENG · Site 30d ∪ IG engagers 30d ∪ LAL1", budget: 150, learn: "Active", opt: "Conversions · booked call", attr: "7-day click", aud: "148K", mult: 1.0, ads: ["v3", "v1", "s1"] },
  ],
  "120211098801": [
    { name: "JT · Property manager titles | AU/NZ | 28-60", budget: 120, learn: "Learning", opt: "Leads · lead form", attr: "7-day click · 1-day view", aud: "610K", mult: 1.0, ads: ["v1", "s1"] },
  ],
  "120211134890": [
    { name: "BROAD · Advantage+ | US | no exclusions", budget: 80, learn: "Learning", opt: "Leads · lead form", attr: "7-day click · 1-day view", aud: "Advantage+", mult: 1.0, ads: ["v2", "c1"] },
  ],
  "120209831914": [{ name: "BROAD · AU/NZ/US | reels only", budget: 60, learn: "Active", opt: "Reach", attr: "1-day view", aud: "Broad", mult: 1.0, ads: ["v2"] }],
  "120208604277": [{ name: "INT · Dental practice owners | US", budget: 110, learn: "Active", opt: "Leads · lead form", attr: "7-day click · 1-day view", aud: "820K", mult: 1.0, ads: ["s1", "c1"] }],
};

export interface Day {
  spend: number;
  imp: number;
  lclk: number;
  leads: number;
  reach: number;
}

/* genDays — verbatim seeded daily generator (source lines 871-890). */
function genDays(n: number, camp: Campaign): Day[] {
  const out: Day[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const today = new Date(2026, 5, 11);
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    const wk = dow === 0 || dow === 6 ? 0.72 : 1;
    const drift = 1 + 0.15 * Math.sin(i / 9) + (rand() - 0.5) * 0.18;
    const spend = camp.endAgo && i < camp.endAgo ? 0 : camp.base * wk * drift;
    if (spend < 1) {
      out.push({ spend: 0, imp: 0, lclk: 0, leads: 0, reach: 0 });
      continue;
    }
    const cpm = camp.cpm[0] + rand() * (camp.cpm[1] - camp.cpm[0]);
    const imp = (spend / cpm) * 1000;
    const lctr = (camp.lctr[0] + rand() * (camp.lctr[1] - camp.lctr[0])) / 100;
    const lclk = imp * lctr;
    let cvr = camp.cvr[0] + rand() * (camp.cvr[1] - camp.cvr[0]);
    if (i <= 2) cvr *= [0.45, 0.68, 0.86][i];
    out.push({ spend, imp, lclk, leads: lclk * cvr, reach: imp / (1.5 + rand() * 0.9) });
  }
  return out;
}

/* genAll — module-init, deterministic (source line 892). */
const SERIES: Record<string, Day[]> = {};
(function genAll() {
  seed = 20260611;
  CAMPAIGNS.forEach((c) => (SERIES[c.id] = genDays(180, c)));
})();

export function rollup(ids: string[], days: number): Day[] {
  const len = SERIES[ids[0]].length;
  const rows: Day[] = [];
  for (let i = len - days; i < len; i++) {
    const r: Day = { spend: 0, imp: 0, lclk: 0, leads: 0, reach: 0 };
    ids.forEach((id) => {
      const x = SERIES[id][i];
      r.spend += x.spend;
      r.imp += x.imp;
      r.lclk += x.lclk;
      r.leads += x.leads;
      r.reach += x.reach;
    });
    rows.push(r);
  }
  return rows;
}
const sum = (rows: Day[], k: keyof Day) => rows.reduce((s, r) => s + r[k], 0);

export interface Kpis {
  spend: number;
  imp: number;
  lclk: number;
  leads: number;
  cpl: number;
  ctr: number;
  cpm: number;
  freq: number;
}
export function kpisOf(rows: Day[]): Kpis {
  const spend = sum(rows, "spend"), imp = sum(rows, "imp"), lclk = sum(rows, "lclk"), leads = sum(rows, "leads"), reach = sum(rows, "reach");
  return { spend, imp, lclk, leads, cpl: leads ? spend / leads : 0, ctr: imp ? (lclk / imp) * 100 : 0, cpm: imp ? (spend / imp) * 1000 : 0, freq: reach ? imp / reach : 0 };
}

/** Per-campaign KPIs over the last `days` (default RANGE). */
export function campaignKpis(campId: string, days = RANGE): Kpis {
  return kpisOf(rollup([campId], days));
}

/** The 7-day weekly CPL series for one ad, over 8 weeks (source lines 1321-1327). */
export function weeklyCpl(campId: string, setIdx: number, adKey: string): number[] {
  const c = CAMPAIGNS.find((x) => x.id === campId)!;
  const sets = ADSETS[campId] || [];
  const s2 = sets[setIdx];
  const totB = sets.reduce((a, b) => a + b.budget, 0);
  const share = s2.budget / totB;
  const lib = AD_LIB[adKey];
  const shSum = s2.ads.reduce((a, k2) => a + AD_LIB[k2].share, 0);
  const sh = lib.share / shSum;
  const wk: number[] = [];
  for (let w = 7; w >= 0; w--) {
    const slice = rollup([c.id], (w + 1) * 7).slice(0, 7);
    const ws = sum(slice, "spend") * share * sh;
    const wl = sum(slice, "leads") * share * s2.mult * sh * lib.mult;
    if (wl > 0.2) wk.push(ws / wl);
  }
  return wk;
}

/* ---- name → id lookups (clone rows carry names, not ids) ---- */
export const CAMP_BY_NAME: Record<string, string> = Object.fromEntries(CAMPAIGNS.map((c) => [c.name, c.id]));
export const AD_KEY_BY_NAME: Record<string, string> = Object.fromEntries(Object.entries(AD_LIB).map(([k, a]) => [a.name, k]));

/** Where an ad delivers most spend — its (campId,setIdx) home for the leaderboard drill (source adAgg.top). */
export function adTopLocation(adKey: string): { campId: string; setIdx: number } | null {
  const candidates: { campId: string; setIdx: number; spend: number }[] = [];
  CAMPAIGNS.filter((c) => c.status === "ACTIVE").forEach((c) => {
    const ck = campaignKpis(c.id);
    const sets = ADSETS[c.id] || [];
    const tot = sets.reduce((a, b) => a + b.budget, 0);
    sets.forEach((s2, si) => {
      if (!s2.ads.includes(adKey)) return;
      const sSpend = (ck.spend * s2.budget) / tot;
      const shSum = s2.ads.reduce((a, k2) => a + AD_LIB[k2].share, 0);
      const sh = AD_LIB[adKey].share / shSum;
      candidates.push({ campId: c.id, setIdx: si, spend: sSpend * sh });
    });
  });
  if (!candidates.length) return null;
  const top = candidates.reduce((best, x) => (x.spend > best.spend ? x : best));
  return { campId: top.campId, setIdx: top.setIdx };
}

export const activeCampaigns = () => CAMPAIGNS.filter((c) => c.status === "ACTIVE");

/** Real daily spend series (last `days`), normalized to 0..1 for the area chart. */
export function campaignSpendSeries(campId: string, days = RANGE): number[] {
  const rows = rollup([campId], days);
  const max = Math.max(...rows.map((r) => r.spend), 1);
  return rows.map((r) => Math.max(0.02, r.spend / max));
}
/** Peak daily spend (last `days`) — powers the chart's y-axis ticks. */
export function campaignSpendPeak(campId: string, days = RANGE): number {
  return Math.max(...rollup([campId], days).map((r) => r.spend), 1);
}

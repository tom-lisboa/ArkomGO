import type { IconKey } from "./icons";
import {
  AD_LIB,
  ADSETS,
  CAMPAIGNS,
  CAMP_BY_NAME,
  RANGE,
  adTopLocation,
  campaignKpis,
  campaignSpendPeak,
  campaignSpendSeries,
  weeklyCpl,
} from "./meta-engine";

/* ============================================================
   Peek section model + per-type builders. Every peek is ported
   1:1 from dash_index.html — each builder reproduces exactly the
   sections the source template emits (pdots, prop strip, stat
   grid, creative card, sigrows, activity timelines, line-item /
   sequence tables, placement bars, weekly sparkline, area chart).
   Demo data (deals / invoices / posts / campaigns / engagements)
   is ported verbatim from the source; nothing is invented.
   ============================================================ */

/* ---------- formatters (verbatim) ---------- */
const fmt$ = (v: number) => "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmt$2 = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (v: number) => Math.round(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (v: number) => v.toFixed(2) + "%";
const kfmt = (v: number) => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k" : Math.round(v).toString());

/* ---------- section union ---------- */
export type BarFmtKey = "usd" | "num" | "x" | "pct";

export interface TCell {
  text: string;
  sub?: string;
  num?: boolean;
  strong?: boolean;
  muted?: boolean;
  chipLabel?: string;
  chipVariant?: string;
}
export interface TRow {
  cells: TCell[];
  drillSet?: number;
  drillAd?: string;
}
export type SigPart =
  | { chip: { label: string; variant: string } }
  | { b: string }
  | { s: string };

export type Sec =
  | { t: "pdots"; on: number; total: number; label: string }
  | { t: "props"; items: [string, string][] }
  | { t: "stats"; cols: number; items: { l: string; v: string }[] }
  | { t: "creative"; fmt: string; headline?: string; body?: string }
  | { t: "sig"; tone: "good" | "warn" | "info"; icon: IconKey; parts: SigPart[]; flush?: boolean }
  | { t: "subhead"; text: string }
  | { t: "timeline"; rows: { time: string; text: string; role?: string; danger?: boolean }[] }
  | { t: "hbar"; title?: string; items: { label: string; v: number; color: string }[]; max: number; fmt: BarFmtKey }
  | { t: "spark"; title: string; vals: number[]; caption: string; color: string }
  | { t: "grid2"; left: Sec; right: Sec }
  | { t: "progress"; pct: number; danger?: boolean }
  | { t: "area"; seedKey: string; color: string; values: number[]; yLabels: string[]; xLabels: string[] }
  | { t: "table"; head: { label: string; num?: boolean }[]; rows: TRow[] };

export type SubPart =
  | { chip: string; variant: string }
  | { text: string }
  | { crumb: string; go: "camp" | "set" };

export interface PeekData {
  title: string;
  titlePlain?: boolean;
  sub: SubPart[];
  sections: Sec[];
}

/* Meta drill peek carries its navigation level. */
export type MetaLevel = "camp" | "set" | "ad";
export interface MetaPeek extends PeekData {
  level: MetaLevel;
}
export interface MetaState {
  campId: string;
  setIdx: number | null;
  adKey: string | null;
}

/* ============================================================
   META DRILL — campaign → ad set → ad, ported from renderPeek.
   ============================================================ */

/** y-axis ticks + x-axis dates for a campaign area chart (peak from real spend). */
function campaignChartAxes(campId: string): { yLabels: string[]; xLabels: string[] } {
  const peak = campaignSpendPeak(campId) * 1.12;
  const yLabels = [1, 2 / 3, 1 / 3, 0].map((f) => "$" + kfmt(peak * f));
  const end = new Date(2026, 5, 11);
  const xLabels: string[] = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - Math.round((i / 4) * (RANGE - 1)));
    xLabels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return { yLabels, xLabels };
}

export function buildMetaPeek(state: MetaState): MetaPeek {
  const { campId, setIdx, adKey } = state;
  const c = CAMPAIGNS.find((x) => x.id === campId)!;
  const k = campaignKpis(c.id);
  const sets = ADSETS[c.id] || [];
  const totB = sets.reduce((a, b) => a + b.budget, 0);

  /* ---- level 1 · campaign ---- */
  if (setIdx == null) {
    const axes = campaignChartAxes(c.id);
    const setRows: TRow[] = sets.map((s2, si) => {
      const share = s2.budget / totB;
      const sl = k.leads * share * s2.mult;
      const chipLabel = s2.learn === "Learning" ? "Learning" : s2.learn === "Limited" ? "Limited" : "Active";
      const chipVariant = s2.learn === "Learning" ? "learning" : s2.learn === "Limited" ? "fatigue" : "active";
      return {
        drillSet: si,
        cells: [
          { text: s2.name, sub: `${s2.opt} · audience ${s2.aud}` },
          { text: "", chipLabel, chipVariant },
          { text: `$${s2.budget}/d`, num: true },
          { text: fmt$(k.spend * share), num: true },
          { text: fmtN(sl), num: true },
          { text: fmt$2((k.spend * share) / Math.max(1, sl)), num: true },
          { text: "›", num: true, muted: true },
        ],
      };
    });

    // crumb + Detail box + 7 cards, matching the live app (REF-peek-campaign)
    const sub: SubPart[] = [{ text: "Meta Ads · Paid Acquisition · Campaigns" }];

    return {
      level: "camp",
      title: c.name,
      sub,
      sections: [
        {
          t: "props",
          items: [["Detail", `${c.objective.replace("OUTCOME_", "").toLowerCase()} · ${c.bid.toLowerCase()} · since ${c.started}`]],
        },
        {
          t: "stats",
          cols: 5,
          items: [
            { l: "Delivery", v: c.status === "ACTIVE" ? "Active" : "Paused" },
            { l: "Budget", v: c.status === "ACTIVE" ? `$${c.budget}/d` : "—" },
            { l: "Spend", v: fmt$(k.spend) },
            { l: "Leads", v: fmtN(k.leads) },
            { l: "CPL", v: k.leads > 1 ? fmt$2(k.cpl) : "—" },
            { l: "CTR", v: k.spend > 1 ? fmtPct(k.ctr) : "—" },
            { l: "Freq", v: k.spend > 1 ? k.freq.toFixed(2) : "—" },
          ],
        },
        { t: "area", seedKey: "meta-" + c.id, color: "#A78BFA", values: campaignSpendSeries(c.id), yLabels: axes.yLabels, xLabels: axes.xLabels },
        {
          t: "table",
          head: [{ label: "Ad set" }, { label: "Phase" }, { label: "Budget", num: true }, { label: "Spend", num: true }, { label: "Leads", num: true }, { label: "CPL", num: true }, { label: "" }],
          rows: setRows,
        },
      ],
    };
  }

  /* ---- level 2 · ad set ---- */
  const s2 = sets[setIdx];
  const share = s2.budget / totB;
  if (!adKey) {
    const sk = { spend: k.spend * share, leads: k.leads * share * s2.mult, ctr: k.ctr * s2.mult };
    const shSum = s2.ads.reduce((a, key) => a + AD_LIB[key].share, 0);
    const adRows: TRow[] = s2.ads.map((key) => {
      const lib = AD_LIB[key];
      const sh = lib.share / shSum;
      const aSpend = sk.spend * sh;
      const aLeads = sk.leads * sh * lib.mult;
      const chipVariant = lib.q === "Above average" ? "quality" : lib.q === "Average" ? "qavg" : "fatigue";
      return {
        drillAd: key,
        cells: [
          { text: lib.name, sub: lib.fmt },
          { text: "", chipLabel: lib.q, chipVariant },
          { text: lib.ts ? lib.ts.toFixed(1) + "%" : "—", num: true },
          { text: fmt$(aSpend), num: true },
          { text: fmtN(aLeads), num: true },
          { text: fmt$2(aSpend / Math.max(1, aLeads)), num: true },
          { text: "›", num: true, muted: true },
        ],
      };
    });
    return {
      level: "set",
      title: s2.name,
      sub: [{ crumb: c.name, go: "camp" }, { text: " › ad set · last " + RANGE + " days" }],
      sections: [
        {
          t: "props",
          items: [
            ["Optimization", s2.opt],
            ["Attribution", s2.attr],
            ["Audience", s2.aud],
            ["Daily budget", `$${s2.budget}`],
            ["Placements", "Advantage+"],
            ["Learning", s2.learn],
          ],
        },
        {
          t: "stats",
          cols: 4,
          items: [
            { l: "Spend", v: fmt$(sk.spend) },
            { l: "Leads", v: fmtN(sk.leads) },
            { l: "CPL", v: fmt$2(sk.spend / Math.max(1, sk.leads)) },
            { l: "CTR", v: fmtPct(sk.ctr) },
          ],
        },
        {
          t: "table",
          head: [{ label: "Ad" }, { label: "Quality" }, { label: "Thumbstop", num: true }, { label: "Spend", num: true }, { label: "Leads", num: true }, { label: "CPL", num: true }, { label: "" }],
          rows: adRows,
        },
      ],
    };
  }

  /* ---- level 3 · single ad / creative ---- */
  const lib = AD_LIB[adKey];
  const shSum = s2.ads.reduce((a, key) => a + AD_LIB[key].share, 0);
  const sh = lib.share / shSum;
  const aSpend = k.spend * share * sh;
  const aLeads = k.leads * share * s2.mult * sh * lib.mult;
  const aCpl = aSpend / Math.max(1, aLeads);
  const isVideo = lib.fmt.startsWith("Video");
  const wkVals = weeklyCpl(c.id, setIdx, adKey);
  const fatiguing = wkVals.length > 1 && wkVals[wkVals.length - 1] > wkVals[0] * 1.18;
  const plc = [
    { label: "Instagram Reels", v: aSpend * 0.38, color: "#A78BFA" },
    { label: "Facebook Feed", v: aSpend * 0.26, color: "var(--pk-copper)" },
    { label: "Instagram Feed", v: aSpend * 0.19, color: "#5EEAD4" },
    { label: "Stories", v: aSpend * 0.17, color: "#7DD3FC" },
  ];
  return {
    level: "ad",
    title: lib.name,
    titlePlain: true,
    sub: [
      { crumb: c.name, go: "camp" },
      { text: " › " },
      { crumb: s2.name.split(" | ")[0], go: "set" },
      { text: " › ad · last " + RANGE + " days" },
    ],
    sections: [
      { t: "creative", fmt: `${lib.fmt} · CTA “${lib.cta}”`, headline: lib.headline, body: lib.primary },
      {
        t: "stats",
        cols: 4,
        items: [
          { l: "Spend", v: fmt$(aSpend) },
          { l: "Leads", v: fmtN(aLeads) },
          { l: "CPL", v: fmt$2(aCpl) },
          { l: "CTR", v: fmtPct(k.ctr * lib.mult) },
        ],
      },
      {
        t: "stats",
        cols: 4,
        items: [
          { l: "Thumbstop", v: lib.ts ? lib.ts.toFixed(1) + "%" : "—" },
          { l: "Hook rate (3s)", v: isVideo ? lib.hook.toFixed(1) + "%" : "—" },
          { l: "Hold (15s)", v: isVideo ? lib.hold.toFixed(1) + "%" : "—" },
          { l: "Frequency", v: k.freq.toFixed(2) },
        ],
      },
      {
        t: "grid2",
        left: { t: "hbar", title: "Spend by placement", items: plc, max: plc[0].v, fmt: "usd" },
        right: {
          t: "spark",
          title: `CPL by week · ${wkVals.length}w ${fatiguing ? "· fatiguing" : "· stable"}`,
          vals: wkVals,
          caption: `${fmt$2(wkVals[0] || 0)} → ${fmt$2(wkVals[wkVals.length - 1] || 0)}`,
          color: fatiguing ? "#EF4444" : "#5EEAD4",
        },
      },
    ],
  };
}

/** Resolve a clicked Meta row (by first-cell text) into a drill entry point. */
export function metaEntryFromRow(panelTitle: string, firstCell: string): MetaState | null {
  const pt = panelTitle.toLowerCase();
  if (pt.includes("creative")) {
    const key = Object.entries(AD_LIB).find(([, a]) => a.name === firstCell)?.[0];
    if (!key) return null;
    const loc = adTopLocation(key);
    return loc ? { campId: loc.campId, setIdx: loc.setIdx, adKey: key } : null;
  }
  const campId = CAMP_BY_NAME[firstCell];
  return campId ? { campId, setIdx: null, adKey: null } : null;
}

/** Meta budget-pacing row label (short name) → campaign id. */
export function metaPacingCampId(label: string): string | null {
  const c = CAMPAIGNS.find((x) => x.name.split(" | ")[1] === label || x.name.includes(label));
  return c ? c.id : null;
}

/* ============================================================
   LIST PEEKS — pipeline / finance / content / outbound / ops.
   Demo data ported verbatim; builders emit the source sections.
   ============================================================ */

/* ---- SALES PIPELINE (deals) ---- */
const STAGES = [
  { id: "appointmentscheduled", label: "Appointment Scheduled", p: 0.2 },
  { id: "qualifiedtobuy", label: "Qualified To Buy", p: 0.4 },
  { id: "presentationscheduled", label: "Presentation Scheduled", p: 0.6 },
  { id: "decisionmakerboughtin", label: "Decision Maker Bought-In", p: 0.8 },
  { id: "contractsent", label: "Contract Sent", p: 0.9 },
];
interface Deal {
  name: string;
  contact: string;
  title: string;
  si: number;
  amount: number;
  src: string;
  owner: string;
  closeIn: number;
  age: number;
  lastTouch: number;
  stalled: boolean;
  next: string;
  acts: [string, string, string][];
}
const D = (co: string, proj: string, contact: string, title: string, si: number, amount: number, src: string, owner: string, closeIn: number, age: number, lastTouch: number, stalled: boolean, next: string, acts: [string, string, string][]): Deal => ({ name: `${co} — ${proj}`, contact, title, si, amount, src, owner, closeIn, age, lastTouch, stalled, next, acts });
const DEALS: Deal[] = [
  D("Vantage Freight Group", "Freight-invoice processing", "Dana Whitfield", "CFO", 3, 38000, "Referrals", "A. Reyes", 18, 44, 1, false, "Security review call · Thu 13 Jun", [["9 Jun", "Email", "Proposal v2 opened 3× in one afternoon — Dana plus a new viewer from their finance team"], ["5 Jun", "Call", "32 min · pricing anchored against 1.5 AP headcount; Dana asked for the SOC 2 note"], ["2 Jun", "Meeting", "Live demo on 40 of their own invoices · 96.8% field accuracy on first pass"]]),
  D("Cobalt Equipment Co", "AI quoting engine", "Marcus Hale", "VP Sales", 3, 32500, "Organic search", "M. Okafor", 31, 38, 2, false, "Contract draft to legal · Mon 16 Jun", [["10 Jun", "Email", "Marcus confirmed budget sign-off from the board, asked for net-30 on the deposit"], ["4 Jun", "Meeting", "Quote-turnaround workshop: their reps average 4.1h per quote, target is 20 min"], ["28 May", "Call", "Discovery · 6 sales reps, 90 quotes/week, all manual in spreadsheets"]]),
  D("Parcelworks 3PL", "Reply automation", "Tom Brandt", "Ops Director", 4, 35000, "Paid social", "J. Lindqvist", 9, 49, 33, true, "Re-opener drafted · leads with Vantage case study", [["8 May", "Email", "Contract sent · Tom said “reviewing with our MD this week”"], ["2 May", "Meeting", "Final scope walkthrough · reply classifier + escalation rules agreed"], ["24 Apr", "Call", "Tom looped in their MD, asked for a 3-month pilot option"]]),
  D("Mediquant", "Pipeline reporting", "Dr. Lena Vogel", "Commercial Lead", 2, 19500, "Email marketing", "A. Reyes", 7, 21, 0, false, "Board-pack sample due Fri 14 Jun", [["11 Jun", "Email", "Lena sent their current board pack as the target format · 14 manual hours/month today"], ["6 Jun", "Meeting", "Presentation to commercial team · strongest reaction to the stalled-deal radar"], ["26 May", "Call", "Inbound from the pricing guide · wants CRM-to-board-pack automated"]]),
  D("PulsePoint Gyms", "Member onboarding automation", "Jordan Reece", "Head of Operations", 2, 16000, "Organic social", "M. Okafor", 24, 19, 3, false, "Site visit · Tue 17 Jun, Richmond location", [["8 Jun", "Call", "19 min · churn in first 30 days is the pain, 11 locations on the same stack"], ["3 Jun", "Email", "Jordan shared their onboarding checklist — 23 manual steps per new member"], ["30 May", "Email", "Inbound from founder content · “saw the gym-chain breakdown reel”"]]),
  D("Hartley & Mace Legal", "Meeting intelligence", "Olivia Hartley", "Partner", 1, 14500, "Referrals", "A. Reyes", 26, 12, 1, false, "Conflict-check workflow demo · Wed 18 Jun", [["10 Jun", "Call", "Olivia qualified · 9 fee-earners, file notes eating 6+ hours a week each"], ["9 Jun", "Email", "Referred by Veritas Legal Admin · warm intro from their admin director"], ["9 Jun", "Email", "Discovery booked within 4 hours of the intro"]]),
  D("Ironbark Engineering", "Knowledge base + client portal", "Greg Llewellyn", "Principal", 1, 22000, "Organic search", "J. Lindqvist", 39, 16, 5, false, "Greg reviewing scope doc with second principal", [["6 Jun", "Email", "Scope doc sent · portal first, knowledge base second per Greg’s priority"], ["2 Jun", "Call", "41 min · 30 years of project files, none searchable; client queries take days"], ["27 May", "Email", "Found the engineering-firm teardown via search · booked direct"]]),
  D("Loopkit Software", "Churn-risk alerts expansion", "Elise Marchetti", "COO", 4, 12000, "Referrals", "A. Reyes", 6, 31, 2, false, "Countersign expected this week", [["10 Jun", "Email", "Contract sent for Phase 2 · alert rules expanding to the annual-plan cohort"], ["5 Jun", "Meeting", "Phase 1 review: alerts caught 9 of 11 churns 3+ weeks early"], ["29 May", "Call", "Elise wants the same engine pointed at expansion-revenue signals"]]),
  D("BrightSmile Dental Group", "Front-desk intake automation", "Dr. Hannah Cho", "Practice Director", 0, 11000, "Paid social", "M. Okafor", 33, 8, 2, false, "Discovery call · Fri 14 Jun 10am", [["9 Jun", "Email", "Booked via the case-study lead form · 4 practices, front desk drowning in reschedules"], ["9 Jun", "Email", "Pre-call brief drafted: 12 appointment types mapped from their site"]]),
  D("Stackbridge IT Services", "RFP response engine · Phase 1", "Owen McAllister", "Bid Manager", 2, 27500, "Direct traffic", "J. Lindqvist", 42, 27, 4, false, "Pilot results presentation · 24 Jun", [["7 Jun", "Meeting", "Phase 0 pilot demo · answer library hit 71% first-draft acceptance on a live RFP"], ["31 May", "Email", "Owen sent 3 more past RFPs to widen the answer corpus"], ["19 May", "Call", "They lose ~40% of bids to slow turnaround, not content quality"]]),
  D("Keystone Property Co", "Lead reactivation", "Sam Donnelly", "General Manager", 1, 9500, "Email marketing", "A. Reyes", 28, 35, 21, true, "Stalled · re-opener queued behind Parcelworks", [["21 May", "Email", "Sam went quiet after pricing · last open was 18 days ago"], ["12 May", "Call", "2,400 dormant leads in their CRM, no nurture running"], ["6 May", "Email", "Replied to the reactivation case study email same morning"]]),
  D("Atlas Surveying Partners", "Phase 2 · tender automation", "Callum Reid", "Director", 3, 18000, "Referrals", "M. Okafor", 13, 22, 1, false, "Phase 2 scope sign-off · Mon 16 Jun", [["10 Jun", "Meeting", "Phase 1 retro: bid automation cut prep from 9h to 80 min per tender"], ["3 Jun", "Email", "Callum asked to extend into tender-discovery and go/no-go scoring"], ["28 May", "Email", "Phase 1 invoice paid 2 Jun · expansion conversation opened by them"]]),
  D("Lernio", "Support deflection", "Mia Sandberg", "Head of Customer Success", 0, 8500, "Organic social", "J. Lindqvist", 37, 6, 1, false, "Discovery · Mon 16 Jun 2pm", [["10 Jun", "Email", "Mia booked from the support-deflection breakdown · ticket volume doubled since March"], ["10 Jun", "Email", "Sent their public help-center for a pre-call coverage scan · 38% of tickets answerable today"]]),
  D("Halloran & Frost Accounting", "Client onboarding automation", "Ben Halloran", "Managing Partner", 0, 13500, "Referrals", "A. Reyes", 45, 5, 0, false, "Discovery · Thu 19 Jun", [["11 Jun", "Email", "Warm intro from Cobalt’s CFO · tax season onboarding is the stated pain"], ["11 Jun", "Email", "Calendar link sent · Ben booked within the hour"]]),
];
const DEALS_SHOWN = [...DEALS].sort((a, b) => b.amount - a.amount);

function dealPeek(d: Deal, i: number, total: number): PeekData {
  const stage = STAGES[d.si];
  const sub: SubPart[] = [{ chip: stage.label, variant: stage.p >= 0.8 ? "quality" : "learning" }];
  if (d.stalled) sub.push({ chip: "Stalled", variant: "fatigue" });
  sub.push({ text: ` · deal ${i + 1} of ${total}` });
  const secs: Sec[] = [
    { t: "pdots", on: STAGES.filter((st) => st.p <= stage.p).length, total: STAGES.length, label: `${Math.round(stage.p * 100)}% probability` },
    { t: "props", items: [["Contact", `${d.contact} · ${d.title}`], ["Owner", d.owner], ["Source", d.src], ["Created", `${d.age}d ago`]] },
    {
      t: "stats",
      cols: 4,
      items: [
        { l: "Amount", v: fmt$(d.amount) },
        { l: "Weighted", v: fmt$(d.amount * stage.p) },
        { l: "Expected close", v: "in " + d.closeIn + "d" },
        { l: "Last touch", v: d.lastTouch === 0 ? "today" : d.lastTouch + "d ago" },
      ],
    },
    { t: "sig", tone: "info", icon: "clock", flush: true, parts: [{ b: "Next step:" }, { s: " " + d.next }] },
    { t: "subhead", text: "Activity" },
    { t: "timeline", rows: d.acts.map((a) => ({ time: a[0], text: a[2], role: a[1] })) },
  ];
  if (d.stalled) secs.push({ t: "sig", tone: "warn", icon: "alert", flush: true, parts: [{ b: `Stalled ${d.lastTouch} days.` }, { s: " A context-aware re-opener is drafted · leads with the latest case study, not “checking in”." }] });
  return { title: d.name, sub, sections: secs };
}

/* ---- FINANCE (invoices) ---- */
interface Inv {
  no: string;
  c: string;
  who: string;
  terms: string;
  t: number;
  due: number;
  dd: string;
  sv: number;
  st: string;
  cls: string;
  od?: boolean;
  items: [string, number][];
  hist: [string, string][];
}
const INVOICES: Inv[] = [
  { no: "INV-0259", c: "Meridian Freight Group", who: "Ava Brennan · AP Manager", terms: "Net 14", t: 12500, due: 8240, dd: "due in 12d", sv: 12, st: "Awaiting payment", cls: "active", items: [["Invoice processing · Phase 2 milestone 2 of 3", 9500], ["Accuracy benchmark report · 240-doc validation", 3000]], hist: [["30 May", "Sent to Ava Brennan · cc accounts@meridianfreight.com"], ["30 May", "Viewed · 41 min after send"], ["9 Jun", "Part-payment received · $4,260"]] },
  { no: "INV-0257", c: "Northgate Equipment Co", who: "Ruth Calloway · Sales Ops Lead", terms: "Net 14", t: 9800, due: 9800, dd: "overdue 9d", sv: -9, st: "Awaiting payment", cls: "fatigue", od: true, items: [["Quoting engine · monthly retainer · June", 6500], ["Template library build · 14 patterns", 3300]], hist: [["19 May", "Sent to Ruth Calloway"], ["26 May", "Reminder 1 · auto"], ["4 Jun", "Reminder 2 · auto · opened, no reply"], ["9 Jun", "Escalation drafted · awaiting your approval"]] },
  { no: "INV-0256", c: "Atlas Surveying Partners", who: "Callum Reid · Director", terms: "Net 7", t: 7400, due: 0, dd: "paid 2 Jun", sv: 99, st: "Paid", cls: "quality", items: [["Bid automation · Phase 1 · final milestone", 7400]], hist: [["26 May", "Sent to Callum Reid"], ["27 May", "Viewed"], ["2 Jun", "Paid in full · bank transfer"]] },
  { no: "INV-0254", c: "Harborview Property Group", who: "Paula Vance · Operations Manager", terms: "Net 7", t: 5000, due: 5000, dd: "overdue 23d", sv: -23, st: "Awaiting payment", cls: "fatigue", od: true, items: [["Phase 0 audit · 50% deposit", 5000]], hist: [["12 May", "Sent to Paula Vance"], ["19 May", "Reminder 1 · auto"], ["28 May", "Reminder 2 · auto"], ["6 Jun", "Paula replied · “processing this week” · no payment yet"]] },
  { no: "INV-0253", c: "Lumen Scheduling Co", who: "Dom Castellano · Founder", terms: "Net 7", t: 4200, due: 0, dd: "paid 28 May", sv: 99, st: "Paid", cls: "quality", items: [["Support-content engine · monthly · May", 4200]], hist: [["21 May", "Sent to Dom Castellano"], ["28 May", "Paid in full · card"]] },
  { no: "INV-0260", c: "Veritas Legal Admin", who: "Marie Duval · Admin Director", terms: "Net 14", t: 6800, due: 6800, dd: "draft · not sent", sv: 50, st: "Draft", cls: "paused", items: [["Meeting intelligence · Phase 0", 5200], ["Knowledge base setup · 9 matter templates", 1600]], hist: [["11 Jun", "Drafted from signed scope · awaiting your review before send"]] },
];

function invoicePeek(v: Inv, i: number, total: number): PeekData {
  const sub: SubPart[] = [{ chip: v.st, variant: v.cls }];
  if (v.od) sub.push({ chip: "Overdue", variant: "fatigue" });
  sub.push({ text: ` · invoice ${i + 1} of ${total}` });
  const itemRows: TRow[] = v.items.map((it) => ({ cells: [{ text: it[0] }, { text: fmt$(it[1]), num: true }] }));
  itemRows.push({ cells: [{ text: "Total", strong: true }, { text: fmt$(v.items.reduce((s, it) => s + it[1], 0)), num: true, strong: true }] });
  const secs: Sec[] = [
    { t: "props", items: [["Billed to", v.who], ["Terms", v.terms]] },
    {
      t: "stats",
      cols: 4,
      items: [
        { l: "Total", v: fmt$(v.t) },
        { l: "Amount due", v: v.due ? fmt$(v.due) : "—" },
        { l: "Status", v: v.dd },
        { l: "Paid", v: v.t - v.due > 0 ? fmt$(v.t - v.due) : "—" },
      ],
    },
    { t: "subhead", text: "Line items" },
    { t: "table", head: [{ label: "" }, { label: "", num: true }], rows: itemRows },
    { t: "subhead", text: "History" },
    { t: "timeline", rows: v.hist.map((h) => ({ time: h[0], text: h[1] })) },
  ];
  if (v.od) secs.push({ t: "sig", tone: "warn", icon: "alert", flush: true, parts: [{ b: `${Math.abs(v.sv)} days overdue.` }, { s: " Auto-chase exhausted · escalation to a phone call is a human decision, queued for Monday." }] });
  return { title: `${v.no} · ${v.c}`, sub, sections: secs };
}

/* ---- CONTENT (posts) ---- */
interface Post {
  cap: string;
  date: string;
  views: number;
  reach: number;
  saved: number;
  shares: number;
  wt: number | null;
  type: string;
  hook: string;
}
const MEDIA: Post[] = [
  { cap: "“I replaced a 6-person back office with 4 agents” · talking head", date: "4 Jun · 7:14am", views: 412000, reach: 318000, saved: 9100, shares: 6400, wt: 11.2, type: "Reel", hook: "Bold claim + number" },
  { cap: "Full org-chart walkthrough · all 137 AI jobs on one map", date: "28 May · 12:02pm", views: 188000, reach: 151000, saved: 7800, shares: 3900, wt: 14.8, type: "Reel", hook: "Visual proof on screen" },
  { cap: "240 invoices in 11 minutes · screen recording, no talking", date: "8 Jun · 7:31am", views: 134000, reach: 102000, saved: 4600, shares: 2800, wt: 16.3, type: "Reel", hook: "Process running live" },
  { cap: "Client case · the freight-invoice engine, start to finish", date: "21 May · 6:58am", views: 96000, reach: 80400, saved: 2900, shares: 1300, wt: 9.7, type: "Reel", hook: "Tension → resolution" },
  { cap: "“Your CRM is lying to your forecast” · whiteboard breakdown", date: "31 May · 1:15pm", views: 88000, reach: 71200, saved: 3300, shares: 1700, wt: 12.1, type: "Reel", hook: "Contrarian open" },
  { cap: "Carousel · 5 ops jobs to hand to an agent first", date: "25 May · 8:00am", views: 41000, reach: 36800, saved: 2100, shares: 600, wt: null, type: "Carousel", hook: "Listicle promise" },
  { cap: "POV · watching the morning agent queue drain itself", date: "6 Jun · 7:05am", views: 38500, reach: 33100, saved: 900, shares: 740, wt: 8.2, type: "Reel", hook: "POV ambience" },
  { cap: "Carousel · what an AI audit actually hands you", date: "18 May · 9:30am", views: 22000, reach: 19800, saved: 1400, shares: 280, wt: null, type: "Carousel", hook: "Behind the curtain" },
];
const MEDIAN_VIEWS = 88000;

function postPeek(m: Post, i: number, total: number): PeekData {
  const bigWin = m.views > MEDIAN_VIEWS * 2;
  return {
    title: m.cap,
    sub: [{ chip: m.type, variant: m.type === "Reel" ? "active" : "paused" }, { text: ` · hook: ${m.hook} · post ${i + 1} of ${total}` }],
    sections: [
      {
        t: "stats",
        cols: 5,
        items: [
          { l: "Views", v: fmtN(m.views) },
          { l: "Reach", v: fmtN(m.reach) },
          { l: "Saves", v: fmtN(m.saved) },
          { l: "Shares", v: fmtN(m.shares) },
          { l: "Avg watch", v: m.wt ? m.wt + "s" : "—" },
        ],
      },
      { t: "subhead", text: "vs account median" },
      {
        t: "hbar",
        items: [
          { label: "Views", v: m.views / MEDIAN_VIEWS, color: "#FB7185" },
          { label: "Save rate", v: m.saved / m.views / 0.018, color: "#FB7185" },
          { label: "Share rate", v: m.shares / m.views / 0.011, color: "#FB7185" },
        ],
        max: 5,
        fmt: "x",
      },
      {
        t: "sig",
        tone: bigWin ? "good" : "info",
        icon: bigWin ? "check" : "trend",
        flush: true,
        parts: bigWin
          ? [{ b: "Re-hash candidate." }, { s: " Same idea, new format · proven demand beats new ideas." }]
          : [{ s: "Solid performer · the hook pattern is worth one more variation." }],
      },
    ],
  };
}

/* ---- OUTBOUND (campaigns) ---- */
interface OStep {
  day: string;
  subj: string;
  prev: string;
  share: number;
  rr: number;
  opp: number;
}
interface OCamp {
  n: string;
  list: string;
  sent: number;
  rr: number;
  opp: number;
  b: number;
  steps: OStep[];
  replies: [string, string, string, string][];
}
const OUTBOUND_CAMPS: OCamp[] = [
  {
    n: "Logistics SaaS · freight-invoice angle",
    list: "Ops + finance leaders · 3,184 verified contacts",
    sent: 2840,
    rr: 3.4,
    opp: 19,
    b: 1.6,
    steps: [
      { day: "Day 1", subj: "the 4 hours your AP team loses daily", prev: "Dana, a CFO we work with, cut freight-invoice processing from 4 hours to 11 minutes. Wrote up exactly how —", share: 52, rr: 1.9, opp: 9 },
      { day: "Day 4", subj: "re: the 4 hours", prev: "forgot the one-pager — 240 invoices, 97.2% field accuracy, zero template changes on their side. Worth 15 minutes?", share: 38, rr: 1.1, opp: 7 },
      { day: "Day 9", subj: "closing the loop", prev: "last one from me. If invoice volume isn’t a Q3 problem I’ll leave you alone — but if it is, this is a 2-week fix.", share: 24, rr: 0.4, opp: 3 },
    ],
    replies: [
      ["Interested", "good", "CFO · mid-size 3PL", "“Timely — we just lost our AP lead and the backlog is already growing. Can you do Thursday?”"],
      ["Referral", "info", "Ops Director · freight broker", "“Not my desk, but our Brisbane GM owns this. Looping her in here.”"],
      ["Objection", "warn", "Finance Manager · carrier", "“We tried OCR in 2024 and it couldn’t read our carrier formats.” → counter-example sent, reply pending"],
    ],
  },
  {
    n: "Recruitment agencies · placement-report lead",
    list: "Agency directors · 2,455 verified contacts",
    sent: 2210,
    rr: 2.7,
    opp: 14,
    b: 2.1,
    steps: [
      { day: "Day 1", subj: "your consultants vs their admin", prev: "60 agencies told us where automation actually stuck. Sourcing wasn’t the surprise — admin was. Report attached —", share: 47, rr: 1.5, opp: 7 },
      { day: "Day 5", subj: "the 11-hour number", prev: "one stat from the report keeps landing: consultants average 11 hours a week on candidate admin. What’s yours?", share: 35, rr: 0.9, opp: 5 },
      { day: "Day 10", subj: "parking this", prev: "no reply needed — leaving the benchmark here in case Q3 planning makes it relevant.", share: 21, rr: 0.3, opp: 2 },
    ],
    replies: [
      ["Interested", "good", "Managing Director · tech recruiter", "“The 11-hour figure is generous — ours is worse. Send times for next week.”"],
      ["Interested", "good", "Founder · exec search", "“Read the report twice. Who did the matching-engine build you mention?”"],
    ],
  },
  {
    n: "Property managers · AU/NZ · dormant-lead angle",
    list: "Portfolio managers · 1,377 contacts · re-verify queued",
    sent: 1130,
    rr: 2.1,
    opp: 6,
    b: 2.4,
    steps: [
      { day: "Day 1", subj: "the leads already in your CRM", prev: "a property group we work with found 2,400 dormant owner-leads in their CRM. Reactivation beat their paid spend 3:1 —", share: 44, rr: 1.3, opp: 3 },
      { day: "Day 4", subj: "re: dormant leads", prev: "short version: no new spend, just a sequence over what you already own. Happy to map it on your numbers.", share: 31, rr: 0.6, opp: 2 },
      { day: "Day 9", subj: "last note", prev: "closing this out — if lead reactivation lands on next quarter’s plan, the playbook is yours either way.", share: 18, rr: 0.2, opp: 1 },
    ],
    replies: [
      ["Interested", "good", "GM · property group, Auckland", "“We have exactly this problem. What does the audit look like?”"],
      ["Bounce cluster", "warn", "38 addresses · one stale list segment", "Re-verification queued before the next batch sends"],
    ],
  },
];

function outboundPeek(c: OCamp, i: number, total: number): PeekData {
  const stepRows: TRow[] = c.steps.map((s2) => ({
    cells: [
      { text: `${s2.day} · “${s2.subj}”`, sub: s2.prev },
      { text: s2.share + "%", num: true },
      { text: s2.rr + "%", num: true },
      { text: String(s2.opp), num: true },
    ],
  }));
  const secs: Sec[] = [
    { t: "props", items: [["List", c.list]] },
    {
      t: "stats",
      cols: 4,
      items: [
        { l: "Sent", v: fmtN(c.sent) },
        { l: "Reply rate", v: c.rr + "%" },
        { l: "Opportunities", v: String(c.opp) },
        { l: "Bounce", v: c.b + "%" },
      ],
    },
    { t: "subhead", text: "Sequence" },
    { t: "table", head: [{ label: "Email" }, { label: "Share", num: true }, { label: "Reply rate", num: true }, { label: "Opps", num: true }], rows: stepRows },
    { t: "subhead", text: "Recent replies" },
  ];
  c.replies.forEach((r) => {
    const tone = r[1] as "good" | "warn" | "info";
    const chipVariant = tone === "good" ? "quality" : tone === "warn" ? "fatigue" : "qavg";
    const icon: IconKey = tone === "good" ? "check" : tone === "warn" ? "alert" : "reply";
    secs.push({ t: "sig", tone, icon, flush: true, parts: [{ chip: { label: r[0], variant: chipVariant } }, { b: r[2] }, { s: " · " + r[3] }] });
  });
  secs.push({ t: "sig", tone: "info", icon: "trend", flush: true, parts: [{ b: `The opener carries ${c.steps[0].opp} of ${c.opp} opportunities` }, { s: " · subject variants queued for the next batch." }] });
  return { title: c.n, sub: [{ chip: "Active", variant: "active" }, { text: ` · last ${RANGE} days · campaign ${i + 1} of ${total}` }], sections: secs };
}

/* ---- CLIENT DELIVERY (engagements) ---- */
interface Proj {
  c: string;
  who: string;
  ph: string;
  pct: number;
  st: string;
  next: string;
  acts: string[];
}
const OPS_PROJECTS: Proj[] = [
  { c: "Meridian Freight Group", who: "Ava Brennan · AP Manager", ph: "Phase 2 · production", pct: 82, st: "On track", next: "accuracy benchmark review · Fri", acts: ["Processing batch · 240 freight invoices at 97.2% accuracy", "Benchmark report drafted for Friday review with Ava", "Client portal updated with batch results"] },
  { c: "Northgate Equipment Co", who: "Ruth Calloway · Sales Ops Lead", ph: "Phase 1 · quoting engine", pct: 56, st: "On track", next: "template library sign-off · Mon", acts: ["Quote template library v2 · 14 new patterns from won deals", "Spec parser accuracy 94% on validation set", "Weekly digest sent to Ruth"] },
  { c: "Harborview Property Group", who: "Paula Vance · Operations Manager", ph: "Phase 0 audit", pct: 38, st: "On track", next: "owner-enquiry bot demo · Wed", acts: ["Owner-enquiry flows mapped · 12 enquiry types", "Knowledge base scaffolded · 4 portfolio files current", "Demo environment prepared for Wednesday"] },
  { c: "TalentRise Recruitment", who: "Greta Larsen · Managing Director", ph: "Matching engine · v2", pct: 71, st: "At risk", next: "awaiting ATS API access · 6d", acts: ["Candidate matching tested on 12 past placements", "BLOCKED: ATS credentials pending 6 days", "Escalation email drafted · awaiting approval"] },
  { c: "Loopkit Software", who: "Elise Marchetti · COO", ph: "Churn-risk alerts", pct: 64, st: "On track", next: "Stripe webhook test · Thu", acts: ["Stripe webhook handler built + idempotency keys", "Alert rules encoded · 3 risk tiers", "Test harness ready for Thursday run"] },
  { c: "Stackbridge IT Services", who: "Owen McAllister · Bid Manager", ph: "RFP engine · phase 0", pct: 24, st: "On track", next: "pilot scope sign-off", acts: ["Pilot scope documented", "Answer library seeded · 1,200 past responses", "Awaiting Owen’s sign-off to start the build"] },
];

function opsPeek(p: Proj, i: number, total: number): PeekData {
  return {
    title: p.c,
    sub: [{ chip: p.st, variant: p.st === "At risk" ? "fatigue" : "active" }, { text: ` · ${p.ph} · engagement ${i + 1} of ${total}` }],
    sections: [
      { t: "props", items: [["Client contact", p.who]] },
      {
        t: "stats",
        cols: 3,
        items: [
          { l: "Progress", v: p.pct + "%" },
          { l: "Next milestone", v: p.next.split("·")[0].trim() },
          { l: "When", v: (p.next.split("·")[1] || "—").trim() },
        ],
      },
      { t: "progress", pct: p.pct, danger: p.st === "At risk" },
      { t: "subhead", text: "This week, run by agents" },
      { t: "timeline", rows: p.acts.map((a, k) => ({ time: ["Mon", "Wed", "Today"][k], text: a, danger: a.includes("BLOCKED") })) },
    ],
  };
}

/* ============================================================
   Public API — resolve a clicked list row into the peek array
   (siblings, in display order) + the clicked index.
   ============================================================ */

export type ListCenter = "pipeline" | "finance" | "content" | "outbound" | "ops";

function centerKey(centerName: string): ListCenter | "meta" | null {
  const n = centerName.toLowerCase();
  if (n.includes("meta")) return "meta";
  if (n.includes("hubspot") || n.includes("pipeline")) return "pipeline";
  if (n.includes("xero") || n.includes("finance")) return "finance";
  if (n.includes("instagram") || n.includes("content")) return "content";
  if (n.includes("instantly") || n.includes("outbound")) return "outbound";
  if (n.includes("mission") || n.includes("delivery")) return "ops";
  return null;
}

/** Is this table's rows clickable (opens a peek) for this center? */
export function isPeekable(centerName: string, panelTitle: string): boolean {
  const c = centerKey(centerName);
  const pt = panelTitle.toLowerCase();
  if (c === "meta") return pt.includes("campaign") || pt.includes("creative");
  if (c === "pipeline") return pt.includes("open deals");
  if (c === "finance") return pt.includes("invoices");
  if (c === "content") return pt.includes("top posts") || pt.includes("post");
  if (c === "outbound") return pt.includes("campaign");
  if (c === "ops") return pt.includes("engagement");
  return false;
}

/** Build the sibling peek list for a clicked list-center row. */
export function buildListPeeks(centerName: string, firstCells: string[], clickedIndex: number): { peeks: PeekData[]; index: number } | null {
  const c = centerKey(centerName);
  if (c === "pipeline") {
    const order = firstCells.map((t) => DEALS_SHOWN.find((d) => d.name === t)).filter(Boolean) as Deal[];
    const list = order.length === firstCells.length ? order : DEALS_SHOWN;
    return { peeks: list.map((d, i) => dealPeek(d, i, list.length)), index: clickedIndex };
  }
  if (c === "finance") {
    const order = firstCells.map((t) => INVOICES.find((v) => t.includes(v.no))).filter(Boolean) as Inv[];
    const list = order.length === firstCells.length ? order : INVOICES;
    return { peeks: list.map((v, i) => invoicePeek(v, i, list.length)), index: clickedIndex };
  }
  if (c === "content") {
    const order = firstCells.map((t) => MEDIA.find((m) => m.cap === t)).filter(Boolean) as Post[];
    const list = order.length === firstCells.length ? order : MEDIA;
    return { peeks: list.map((m, i) => postPeek(m, i, list.length)), index: clickedIndex };
  }
  if (c === "outbound") {
    const order = firstCells.map((t) => OUTBOUND_CAMPS.find((o) => o.n === t)).filter(Boolean) as OCamp[];
    const list = order.length === firstCells.length ? order : OUTBOUND_CAMPS;
    return { peeks: list.map((o, i) => outboundPeek(o, i, list.length)), index: clickedIndex };
  }
  if (c === "ops") {
    const order = firstCells.map((t) => OPS_PROJECTS.find((p) => p.c === t)).filter(Boolean) as Proj[];
    const list = order.length === firstCells.length ? order : OPS_PROJECTS;
    return { peeks: list.map((p, i) => opsPeek(p, i, list.length)), index: clickedIndex };
  }
  return null;
}

export { fmt$, fmt$2, fmtN, fmtPct, kfmt };

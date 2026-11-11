import type { IconKey, ChipVariant } from "./icons";
import type { BarFmt, HBar } from "./charts";

/* ============================================================
   Command-center data model. Every KPI / signal / bar / table
   row below is a value exposed in the source. Decorative chart
   curves are generated (see charts.tsx); numbers are verbatim.
   ============================================================ */

export type CenterId = "meta" | "pipeline" | "finance" | "content" | "outbound" | "ops";

export interface Kpi {
  icon: IconKey;
  label: string;
  value: string;
  badge?: { up: boolean; txt: string };
  foot?: string;
  spark?: boolean;
  /** real 0..1-normalized daily series for the sparkline (reactive Meta view). */
  sparkValues?: number[];
}

export interface Signal {
  tone: "good" | "warn" | "info";
  icon: IconKey;
  lead: string;
  rest?: string;
}

export interface ChipSpec {
  label: string;
  variant: ChipVariant;
}

export type Cell =
  | { kind: "name"; text: string; sub: string }
  | { kind: "text"; text: string; danger?: boolean }
  | { kind: "num"; text: string; danger?: boolean }
  | { kind: "chips"; chips: ChipSpec[] }
  | { kind: "progress"; pct: number; danger?: boolean };

export interface TableHead {
  label: string;
  num?: boolean;
}

export interface DataTable {
  kind: "table";
  icon: IconKey;
  title: string;
  sub?: string;
  head: TableHead[];
  rows: Cell[][];
}

export interface Section {
  type: "bars" | "subhead" | "table";
  fmt?: BarFmt;
  bars?: HBar[];
  max?: number;
  icon?: IconKey;
  title?: string;
  head?: TableHead[];
  rows?: Cell[][];
}

export interface Legend {
  label: string;
  color: string;
}

export interface SectionsPanel {
  kind: "sections";
  icon?: IconKey;
  title?: string;
  sub?: string;
  sections: Section[];
}

export interface AreaPanel {
  kind: "area";
  icon: IconKey;
  title: string;
  sub?: string;
  seedKey: string;
  yLabels: string[];
  xLabels: string[];
  height?: number;
  legend?: Legend[];
  /** real 0..1-normalized daily spend series (reactive Meta view). */
  values?: number[];
}

export interface PacingPanel {
  kind: "pacing";
  icon: IconKey;
  title: string;
  sub?: string;
  rows: { label: string; pct: number; state: string; variant: ChipVariant }[];
}

export interface FeedPanel {
  kind: "feed";
  icon: IconKey;
  title: string;
  sub?: string;
  rows: { time: string; text: string; role: string }[];
}

export type Panel = SectionsPanel | AreaPanel | DataTable | PacingPanel | FeedPanel;

export type Block =
  | { type: "kpis"; items: Kpi[] }
  | { type: "signals"; items: Signal[] }
  | { type: "row"; ratio?: "2:1" | "1:2" | "1:1"; left: Panel; right: Panel }
  | { type: "panel"; panel: Panel };

export interface Center {
  id: CenterId;
  short: string;
  name: string;
  sub: string;
  color: string;
  tools: string[];
  ranges?: string[];
  defaultRange?: string;
  guide: { tool: string; time: string; connect: string };
  blocks: Block[];
  cta: { title: string; text: string };
}

/* ---------- cell helpers ---------- */
const nm = (text: string, sub: string): Cell => ({ kind: "name", text, sub });
const tx = (text: string, danger = false): Cell => ({ kind: "text", text, danger });
const nu = (text: string, danger = false): Cell => ({ kind: "num", text, danger });
const cp = (chips: ChipSpec[]): Cell => ({ kind: "chips", chips });
const pg = (pct: number, danger = false): Cell => ({ kind: "progress", pct, danger });

const ACCENT = "var(--a)";
const GOOD = "var(--good)";
const BAD = "var(--bad)";
const COPPER = "var(--copper)";
const INTEL = "#7dd3fc";
const ORANGE = "#ff9d5c";

const DEPLOY = "https://cal.com/arkom/30min";
export const BOOK_CALL = DEPLOY;

/* ============================================================
   1 · META ADS · PAID ACQUISITION
   ============================================================ */
const meta: Center = {
  id: "meta",
  short: "Meta Ads",
  name: "Meta Ads · Paid Acquisition",
  sub: "Every dollar, every lead, every fatigue signal · one screen",
  color: "#a78bfa",
  tools: ["Meta"],
  ranges: ["7d", "14d", "30d", "90d"],
  defaultRange: "30d",
  guide: {
    tool: "the Meta Marketing API",
    time: "~15 min",
    connect:
      "Wired to your real Meta ad account via the Meta Marketing API (Graph API v25.0 act_<AD_ACCOUNT_ID>/insights), using the official Meta Ads connector (mcp.facebook.com/ads) to explore and a Business Manager System User token (ads_read) for the production backend.",
  },
  blocks: [
    {
      type: "kpis",
      items: [
        { icon: "dollar", label: "Total Spend", value: "$31,587", badge: { up: true, txt: "+19.0%" }, foot: "Trending up ↗", spark: true },
        { icon: "users", label: "Leads", value: "1,049", badge: { up: true, txt: "+10.5%" }, foot: "Holding strong ↗", spark: true },
        { icon: "target", label: "Cost per Lead", value: "$30.12", badge: { up: false, txt: "+7.7%" }, foot: "Creeping up ↘", spark: true },
        { icon: "click", label: "Link CTR", value: "0.94%", badge: { up: false, txt: "-3.5%" }, foot: "Creative softening ↘", spark: true },
        { icon: "eye", label: "CPM", value: "$36.27", badge: { up: true, txt: "-0.7%" }, foot: "Auction normal", spark: true },
        { icon: "repeat", label: "Frequency", value: "1.93", badge: { up: false, txt: "+0.2%" }, foot: "Room to scale ↗", spark: true },
      ],
    },
    {
      type: "signals",
      items: [
        { tone: "warn", icon: "alert", lead: "RT | Engagers frequency at 1.9", rest: " and CPL up 28% in 14d · two fresh creatives queued, rotate before Thursday's budget step-up." },
        { tone: "good", icon: "check", lead: "LAL 1% Closed-Won beats the interest stack on CPL by 31%", rest: " · third straight month. Shift $40/day from INT · Freight." },
        { tone: "info", icon: "target", lead: "LAL 2% Guide-downloads is Learning Limited", rest: " · 38 conv/wk vs the 50 it needs. Consolidate into the 1% set or widen geo." },
      ],
    },
    {
      type: "row",
      ratio: "2:1",
      left: {
        kind: "area",
        icon: "trend",
        title: "Spend & cost per lead",
        sub: "Daily spend, cost per lead overlaid · last 30 days",
        seedKey: "meta-spend",
        yLabels: ["$1.3k", "$834", "$417", "$0"],
        xLabels: ["May 15", "May 19", "May 23", "May 27", "May 31", "Jun 4", "Jun 8"],
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
          {
            type: "bars",
            fmt: "usd",
            max: 10740,
            bars: [
              { label: "Instagram Reels", value: 10740, color: ACCENT },
              { label: "Facebook Feed", value: 8528, color: ACCENT },
              { label: "Instagram Feed", value: 5686, color: ACCENT },
              { label: "Instagram Stories", value: 3790, color: ACCENT },
              { label: "Audience Network", value: 1579, color: ACCENT },
              { label: "Marketplace", value: 1263, color: ACCENT },
            ],
          },
          { type: "subhead", icon: "users", title: "Leads by age" },
          {
            type: "bars",
            fmt: "num",
            max: 357,
            bars: [
              { label: "25–34", value: 325, color: ACCENT },
              { label: "35–44", value: 357, color: ACCENT },
              { label: "45–54", value: 231, color: ACCENT },
              { label: "55–64", value: 94, color: ACCENT },
              { label: "18–24", value: 42, color: ACCENT },
            ],
          },
        ],
      },
    },
    {
      type: "row",
      ratio: "1:2",
      left: {
        kind: "pacing",
        icon: "target",
        title: "Budget pacing",
        sub: "Average daily delivery vs set budget · trailing 14d",
        rows: [
          { label: "Logistics SaaS", pct: 101, state: "On pace", variant: "active" },
          { label: "Recruitment Agencies", pct: 100, state: "On pace", variant: "active" },
          { label: "Engagers 30d + LAL1", pct: 99, state: "On pace", variant: "active" },
          { label: "Property Mgmt", pct: 101, state: "Learning", variant: "learning" },
          { label: "Broad Adv+", pct: 101, state: "Learning", variant: "learning" },
        ],
      },
      right: {
        kind: "table",
        icon: "play",
        title: "Creative leaderboard",
        sub: "Every live creative, ranked by CPL · aggregated across campaigns",
        head: [
          { label: "Creative" },
          { label: "Quality" },
          { label: "Thumbstop", num: true },
          { label: "Hook", num: true },
          { label: "Spend", num: true },
          { label: "Leads", num: true },
          { label: "CPL", num: true },
        ],
        rows: [
          [nm("VID_screenrec-demo-01_speed_0601", "Video · 4:5 · 0:52 · in 1 campaign"), cp([{ label: "Above average", variant: "quality" }]), nu("26.1%"), nu("31.5%"), nu("$2,144"), nu("124"), nu("$17.30")],
          [nm("VID_founder-hook-03_costcut_0524", "Video · 9:16 · 0:34 · in 3 campaigns"), cp([{ label: "Above average", variant: "quality" }]), nu("28.4%"), nu("34.2%"), nu("$10,640"), nu("447"), nu("$23.81")],
          [nm("VID_founder-hook-07_headcount_0517", "Video · 9:16 · 0:41 · in 2 campaigns"), cp([{ label: "Above average", variant: "quality" }]), nu("24.6%"), nu("29.8%"), nu("$4,671"), nu("169"), nu("$27.61")],
          [nm("STA_case-study-card_results_0510", "Static · 1:1 · in 4 campaigns"), cp([{ label: "Average", variant: "qavg" }]), nu("11.2%"), nu("—"), nu("$5,074"), nu("133"), nu("$38.13")],
          [nm("CAR_5-jobs-to-automate_v2_0428", "Carousel · 5 cards · in 3 campaigns"), cp([{ label: "Below average", variant: "fatigue" }]), nu("8.9%"), nu("—"), nu("$2,403"), nu("49"), nu("$48.98")],
          [nm("VID_ugc-style-02_whitepaper_0522", "Video · 9:16 · 0:28 · in 1 campaign"), cp([{ label: "Average", variant: "qavg" }]), nu("21.8%"), nu("26.3%"), nu("$6,656"), nu("132"), nu("$50.44")],
        ],
      },
    },
    {
      type: "panel",
      panel: {
        kind: "table",
        icon: "mega",
        title: "Campaigns",
        sub: "5 active · 7 total · sorted by spend",
        head: [
          { label: "Campaign" },
          { label: "Delivery" },
          { label: "Budget", num: true },
          { label: "Spend", num: true },
          { label: "Leads", num: true },
          { label: "CPL", num: true },
          { label: "CTR", num: true },
          { label: "Freq", num: true },
        ],
        rows: [
          [nm("LG | Logistics SaaS | US | Lead Form | CBO", "leads · highest volume · since 14 Apr 2026"), cp([{ label: "Active", variant: "active" }]), nu("$410/d"), nu("$12,381"), nu("480"), nu("$25.78"), nu("0.97%"), nu("1.92")],
          [nm("LG | Recruitment Agencies | US/CA | Whitepaper | ABO", "leads · highest volume · since 28 Apr 2026"), cp([{ label: "Active", variant: "active" }]), nu("$290/d"), nu("$8,712"), nu("203"), nu("$42.96"), nu("0.81%"), nu("1.96")],
          [nm("RT | Engagers 30d + LAL1 | Book-a-Call | ABO", "leads · cost per result · $24 cap · since 02 Mar 2026"), cp([{ label: "Active", variant: "active" }, { label: "Fatigue", variant: "fatigue" }]), nu("$150/d"), nu("$4,443"), nu("231"), nu("$19.20"), nu("1.54%"), nu("1.86")],
          [nm("LG | Property Mgmt | AU/NZ | Case Study | ABO", "leads · highest volume · since 29 May 2026"), cp([{ label: "Active", variant: "active" }, { label: "Learning", variant: "learning" }]), nu("$120/d"), nu("$3,628"), nu("72"), nu("$50.47"), nu("0.72%"), nu("1.97")],
          [nm("TOF | Broad Adv+ | US | Lead Form | CBO", "leads · highest volume · since 04 Jun 2026"), cp([{ label: "Active", variant: "active" }, { label: "Learning", variant: "learning" }]), nu("$80/d"), nu("$2,423"), nu("62"), nu("$38.83"), nu("0.85%"), nu("1.92")],
          [nm("BR | Founder Reels | Broad | Reach", "awareness · highest volume · since 11 Feb 2026"), cp([{ label: "Paused", variant: "paused" }]), nu("—"), nu("$1,092"), nu("9"), nu("$123.50"), nu("0.57%"), nu("1.94")],
          [nm("[z] LG | Dental Groups | US | Lead Form (Q1)", "leads · highest volume · since 08 Jan 2026"), cp([{ label: "Paused", variant: "paused" }]), nu("—"), nu("$0"), nu("0"), nu("—"), nu("—"), nu("—")],
        ],
      },
    },
  ],
  cta: { title: "Want this for your business?", text: "Wired to your real ad account · alerts, creative-fatigue flags, weekly digests included." },
};

/* ============================================================
   2 · HUBSPOT · SALES PIPELINE
   ============================================================ */
const dealRow = (name: string, sub: string, stage: string, stageVar: ChipVariant, stalled: boolean, amount: string, closeIn: string, owner: string, last: string): Cell[] => [
  nm(name, sub),
  cp(stalled ? [{ label: stage, variant: stageVar }, { label: "Stalled", variant: "fatigue" }] : [{ label: stage, variant: stageVar }]),
  nu(amount),
  nu(closeIn),
  tx(owner),
  nu(last),
];

const pipeline: Center = {
  id: "pipeline",
  short: "Pipeline",
  name: "HubSpot · Sales Pipeline",
  sub: "Weighted forecast, stalled-deal radar, honest win rates",
  color: "#ef4444",
  tools: ["HubSpot"],
  ranges: ["All", "Stalled", "Closing ≤30d"],
  defaultRange: "All",
  guide: {
    tool: "HubSpot CRM",
    time: "~10–15 min",
    connect: "HubSpot CRM via the official @hubspot/mcp-server with a Private App token (CRM v3 API for the backend).",
  },
  blocks: [
    {
      type: "kpis",
      items: [
        { icon: "dollar", label: "Open Pipeline", value: "$277,500", badge: { up: true, txt: "+8.2%" }, foot: "14 open deals", spark: true },
        { icon: "target", label: "Weighted Forecast", value: "$175,900", badge: { up: true, txt: "+11.4%" }, foot: "By stage probability", spark: true },
        { icon: "check", label: "Won This Quarter", value: "$86,500", badge: { up: true, txt: "5 deals" }, foot: "Ahead of pace ↗" },
        { icon: "trend", label: "Win Rate", value: "27%", badge: { up: true, txt: "+4 pts" }, foot: "Trailing 90 days" },
        { icon: "clock", label: "Avg Cycle", value: "47 days", badge: { up: true, txt: "-6d" }, foot: "Faster than last quarter ↗" },
      ],
    },
    {
      type: "row",
      ratio: "1:1",
      left: {
        kind: "sections",
        icon: "trend",
        title: "Pipeline by stage",
        sub: "Deal value at each stage · count in brackets",
        sections: [
          {
            type: "bars",
            fmt: "usd",
            max: 88500,
            bars: [
              { label: "Appointment Scheduled (3)", value: 33000, color: ACCENT },
              { label: "Qualified To Buy (3)", value: 46000, color: ACCENT },
              { label: "Presentation Scheduled (3)", value: 63000, color: ACCENT },
              { label: "Decision Maker Bought-In (3)", value: 88500, color: ACCENT },
              { label: "Contract Sent (2)", value: 47000, color: ACCENT },
            ],
          },
        ],
      },
      right: {
        kind: "sections",
        icon: "grid",
        title: "Pipeline by source",
        sub: "Where the open deals came from",
        sections: [
          {
            type: "bars",
            fmt: "usd",
            max: 96000,
            bars: [
              { label: "Referrals", value: 96000, color: ACCENT },
              { label: "Organic search", value: 54500, color: ACCENT },
              { label: "Paid social", value: 46000, color: ACCENT },
              { label: "Email marketing", value: 29000, color: ACCENT },
              { label: "Direct traffic", value: 27500, color: ACCENT },
              { label: "Organic social", value: 24500, color: ACCENT },
            ],
          },
        ],
      },
    },
    {
      type: "signals",
      items: [
        { tone: "warn", icon: "alert", lead: "$44,500 stalled", rest: " across 2 deals · oldest untouched 33d. Reactivation drafts ready." },
        { tone: "good", icon: "check", lead: "4 deals closing ≤14d", rest: " worth $84,500 · all have next steps booked." },
        { tone: "info", icon: "users", lead: "Referrals close 2.1× faster", rest: " than paid · worth a structured ask after every go-live." },
      ],
    },
    {
      type: "panel",
      panel: {
        kind: "table",
        icon: "file",
        title: "Open deals",
        sub: "Sorted by value · scored against stage probability",
        head: [{ label: "Deal" }, { label: "Stage" }, { label: "Amount", num: true }, { label: "Close", num: true }, { label: "Owner" }, { label: "Last activity", num: true }],
        rows: [
          dealRow("Vantage Freight Group — Freight-invoice processing", "Dana Whitfield · CFO · referrals", "Decision Maker Bought-In", "learning", false, "$38,000", "in 18d", "A. Reyes", "1d ago"),
          dealRow("Parcelworks 3PL — Reply automation", "Tom Brandt · Ops Director · paid social", "Contract Sent", "quality", true, "$35,000", "in 9d", "J. Lindqvist", "33d ago"),
          dealRow("Cobalt Equipment Co — AI quoting engine", "Marcus Hale · VP Sales · organic search", "Decision Maker Bought-In", "learning", false, "$32,500", "in 31d", "M. Okafor", "2d ago"),
          dealRow("Stackbridge IT Services — RFP response engine · Phase 1", "Owen McAllister · Bid Manager · direct traffic", "Presentation Scheduled", "learning", false, "$27,500", "in 42d", "J. Lindqvist", "4d ago"),
          dealRow("Ironbark Engineering — Knowledge base + client portal", "Greg Llewellyn · Principal · organic search", "Qualified To Buy", "learning", false, "$22,000", "in 39d", "J. Lindqvist", "5d ago"),
          dealRow("Mediquant — Pipeline reporting", "Dr. Lena Vogel · Commercial Lead · email marketing", "Presentation Scheduled", "learning", false, "$19,500", "in 7d", "A. Reyes", "today"),
          dealRow("Atlas Surveying Partners — Phase 2 · tender automation", "Callum Reid · Director · referrals", "Decision Maker Bought-In", "learning", false, "$18,000", "in 13d", "M. Okafor", "1d ago"),
          dealRow("PulsePoint Gyms — Member onboarding automation", "Jordan Reece · Head of Operations · organic social", "Presentation Scheduled", "learning", false, "$16,000", "in 24d", "M. Okafor", "3d ago"),
          dealRow("Hartley & Mace Legal — Meeting intelligence", "Olivia Hartley · Partner · referrals", "Qualified To Buy", "learning", false, "$14,500", "in 26d", "A. Reyes", "1d ago"),
          dealRow("Halloran & Frost Accounting — Client onboarding automation", "Ben Halloran · Managing Partner · referrals", "Appointment Scheduled", "learning", false, "$13,500", "in 45d", "A. Reyes", "today"),
          dealRow("Loopkit Software — Churn-risk alerts expansion", "Elise Marchetti · COO · referrals", "Contract Sent", "quality", false, "$12,000", "in 6d", "A. Reyes", "2d ago"),
          dealRow("BrightSmile Dental Group — Front-desk intake automation", "Dr. Hannah Cho · Practice Director · paid social", "Appointment Scheduled", "learning", false, "$11,000", "in 33d", "M. Okafor", "2d ago"),
          dealRow("Keystone Property Co — Lead reactivation", "Sam Donnelly · General Manager · email marketing", "Qualified To Buy", "learning", true, "$9,500", "in 28d", "A. Reyes", "21d ago"),
          dealRow("Lernio — Support deflection", "Mia Sandberg · Head of Customer Success · organic social", "Appointment Scheduled", "learning", false, "$8,500", "in 37d", "J. Lindqvist", "1d ago"),
        ],
      },
    },
  ],
  cta: { title: "Want this for your business?", text: "Your real pipeline scored, forecast, and audited for stalled deals weekly." },
};

/* ============================================================
   3 · XERO · FINANCE
   ============================================================ */
const finance: Center = {
  id: "finance",
  short: "Finance",
  name: "Xero · Finance",
  sub: "Cash, P&L, and who owes you money · chased automatically",
  color: "#facc15",
  tools: ["Xero"],
  ranges: ["6 mo", "12 mo"],
  defaultRange: "12 mo",
  guide: {
    tool: "the Xero Accounting API",
    time: "~15-20 min",
    connect: "Connects to Xero via the official @xeroapi/xero-mcp-server (a machine-to-machine Custom Connection), with the backend calling the Xero Accounting API (api.xero.com/api.xro/2.0) directly for production.",
  },
  blocks: [
    {
      type: "kpis",
      items: [
        { icon: "bank", label: "Cash On Hand", value: "$132,010", badge: { up: true, txt: "+5.1%" }, foot: "Across 2 accounts", spark: true },
        { icon: "trend", label: "Revenue · May", value: "$58,400", badge: { up: true, txt: "+12.4%" }, foot: "Best month this year ↗", spark: true },
        { icon: "dollar", label: "Net Profit · May", value: "$34,900", badge: { up: true, txt: "60%" }, foot: "Margin holding ↗", spark: true },
        { icon: "clock", label: "Receivables", value: "$55,700", badge: { up: false, txt: "$24,300 late" }, foot: "Two invoices overdue ↘" },
      ],
    },
    {
      type: "row",
      ratio: "2:1",
      left: {
        kind: "area",
        icon: "trend",
        title: "Revenue & net profit",
        sub: "Monthly · hover for exact figures",
        seedKey: "fin-rev",
        height: 252,
        yLabels: ["$60k", "$40k", "$20k", "$0"],
        xLabels: ["Jun", "Aug", "Oct", "Dec", "Feb", "Apr"],
        legend: [
          { label: "revenue", color: "var(--a)" },
          { label: "net profit", color: "var(--copper)" },
        ],
      },
      right: {
        kind: "sections",
        icon: "clock",
        title: "Aged receivables",
        sub: "What's owed, by how late it is",
        sections: [
          {
            type: "bars",
            fmt: "usd",
            max: 31400,
            bars: [
              { label: "Current", value: 31400, color: GOOD },
              { label: "1–30 days", value: 12750, color: ACCENT },
              { label: "31–60 days", value: 6200, color: ORANGE },
              { label: "61–90 days", value: 3500, color: BAD },
              { label: "90+ days", value: 1850, color: BAD },
            ],
          },
          { type: "subhead", icon: "bank", title: "Cash by account" },
          {
            type: "bars",
            fmt: "usd",
            max: 84210,
            bars: [
              { label: "Business Checking", value: 84210, color: ACCENT },
              { label: "Savings", value: 47800, color: ACCENT },
            ],
          },
        ],
      },
    },
    {
      type: "signals",
      items: [
        { tone: "good", icon: "check", lead: "8.4 months of runway", rest: " at current burn ($15,700/mo) · before any new revenue." },
        { tone: "warn", icon: "alert", lead: "66% of overdue money sits with one client", rest: " · Northgate. Third nudge queued for human review." },
        { tone: "info", icon: "trend", lead: "Margin trending up 4pts", rest: " since productized phases · retainers carry it." },
      ],
    },
    {
      type: "panel",
      panel: {
        kind: "table",
        icon: "file",
        title: "Invoices",
        sub: "Chased automatically · escalations queued for human review",
        head: [{ label: "Invoice" }, { label: "Client" }, { label: "Total", num: true }, { label: "Due", num: true }, { label: "When" }, { label: "Status" }],
        rows: [
          [tx("INV-0259"), nm("Meridian Freight Group", "Ava Brennan · AP Manager"), nu("$12,500"), nu("$8,240"), tx("due in 12d"), cp([{ label: "Awaiting payment", variant: "active" }])],
          [tx("INV-0257"), nm("Northgate Equipment Co", "Ruth Calloway · Sales Ops Lead"), nu("$9,800"), nu("$9,800"), tx("overdue 9d", true), cp([{ label: "Awaiting payment", variant: "fatigue" }])],
          [tx("INV-0256"), nm("Atlas Surveying Partners", "Callum Reid · Director"), nu("$7,400"), nu("—"), tx("paid 2 Jun"), cp([{ label: "Paid", variant: "quality" }])],
          [tx("INV-0254"), nm("Harborview Property Group", "Paula Vance · Operations Manager"), nu("$5,000"), nu("$5,000"), tx("overdue 23d", true), cp([{ label: "Awaiting payment", variant: "fatigue" }])],
          [tx("INV-0253"), nm("Lumen Scheduling Co", "Dom Castellano · Founder"), nu("$4,200"), nu("—"), tx("paid 28 May"), cp([{ label: "Paid", variant: "quality" }])],
          [tx("INV-0260"), nm("Veritas Legal Admin", "Marie Duval · Admin Director"), nu("$6,800"), nu("$6,800"), tx("draft · not sent"), cp([{ label: "Draft", variant: "paused" }])],
        ],
      },
    },
  ],
  cta: { title: "Want this for your business?", text: "Cash, P&L, and overdue invoices reporting themselves every Monday · and the late ones get chased." },
};

/* ============================================================
   4 · INSTAGRAM + TIKTOK · CONTENT
   ============================================================ */
const content: Center = {
  id: "content",
  short: "Content",
  name: "Instagram + TikTok · Content",
  sub: "What ran, what worked, what to re-hash next",
  color: "#fb7185",
  tools: ["Instagram", "TikTok"],
  ranges: ["7d", "14d", "28d"],
  defaultRange: "28d",
  guide: {
    tool: "the Instagram Graph API + TikTok Display API",
    time: "~20–25 min",
    connect: "Instagram Graph API (Business/Creator account via Instagram Login) for the rich panels + TikTok Display API (video.list) for the second platform, both snapshotted into Supabase on a cron.",
  },
  blocks: [
    {
      type: "kpis",
      items: [
        { icon: "play", label: "Views", value: "1,062,000", badge: { up: true, txt: "+16.4%" }, foot: "Reels carrying reach ↗", spark: true },
        { icon: "eye", label: "Reach", value: "446,000", badge: { up: true, txt: "+18%" }, foot: "Unique accounts", spark: true },
        { icon: "heart", label: "Engaged", value: "31,700", badge: { up: true, txt: "+22%" }, foot: "7.1% of reach ↗" },
        { icon: "users", label: "Net Followers", value: "+1,184", badge: { up: true, txt: "last 28d" }, foot: "Compounding ↗", spark: true },
        { icon: "repeat", label: "Interactions", value: "76,100", badge: { up: true, txt: "+9%" }, foot: "Likes · saves · shares" },
      ],
    },
    {
      type: "row",
      ratio: "2:1",
      left: {
        kind: "area",
        icon: "trend",
        title: "Daily views",
        sub: "The spikes are reels hitting Explore · hover any day",
        seedKey: "content-views",
        height: 268,
        yLabels: ["120k", "80k", "40k", "0"],
        xLabels: ["May 15", "May 20", "May 25", "May 30", "Jun 5", "Jun 11"],
      },
      right: {
        kind: "sections",
        icon: "grid",
        title: "TikTok traffic sources",
        sub: "Where views come from",
        sections: [
          {
            type: "bars",
            fmt: "pct",
            max: 71,
            bars: [
              { label: "For You page", value: 71, color: INTEL },
              { label: "Profile visits", value: 11, color: INTEL },
              { label: "Following feed", value: 9, color: INTEL },
              { label: "Search", value: 6, color: INTEL },
              { label: "Sounds", value: 3, color: INTEL },
            ],
          },
          { type: "subhead", icon: "users", title: "Followers by age" },
          {
            type: "bars",
            fmt: "pct",
            max: 38,
            bars: [
              { label: "25–34", value: 38, color: ACCENT },
              { label: "35–44", value: 27, color: ACCENT },
              { label: "18–24", value: 19, color: ACCENT },
              { label: "45–54", value: 11, color: ACCENT },
              { label: "55+", value: 5, color: ACCENT },
            ],
          },
        ],
      },
    },
    {
      type: "signals",
      items: [
        { tone: "good", icon: "check", lead: "Talking-head hooks run 2.6× median views", rest: " · double down on founder-on-camera." },
        { tone: "info", icon: "heart", lead: "Save rate 2.2%", rest: " · your audience banks this content. Lead-magnet demand is sitting right there." },
        { tone: "warn", icon: "alert", lead: "3-day posting gap last week", rest: " cost an estimated 140k views at current averages." },
      ],
    },
    {
      type: "panel",
      panel: {
        kind: "table",
        icon: "play",
        title: "Top posts · last 28 days",
        sub: "Ranked by views · click-to-peek re-hash logic in the live build",
        head: [{ label: "Post" }, { label: "Type" }, { label: "Views", num: true }, { label: "Reach", num: true }, { label: "Saves", num: true }, { label: "Shares", num: true }, { label: "Avg watch", num: true }],
        rows: [
          [nm("“I replaced a 6-person back office with 4 agents” · talking head", "4 Jun · 7:14am · Bold claim + number"), cp([{ label: "Reel", variant: "active" }]), nu("412,000"), nu("318,000"), nu("9,100"), nu("6,400"), nu("11.2s")],
          [nm("Full org-chart walkthrough · all 137 AI jobs on one map", "28 May · 12:02pm · Visual proof on screen"), cp([{ label: "Reel", variant: "active" }]), nu("188,000"), nu("151,000"), nu("7,800"), nu("3,900"), nu("14.8s")],
          [nm("240 invoices in 11 minutes · screen recording, no talking", "8 Jun · 7:31am · Process running live"), cp([{ label: "Reel", variant: "active" }]), nu("134,000"), nu("102,000"), nu("4,600"), nu("2,800"), nu("16.3s")],
          [nm("Client case · the freight-invoice engine, start to finish", "21 May · 6:58am · Tension → resolution"), cp([{ label: "Reel", variant: "active" }]), nu("96,000"), nu("80,400"), nu("2,900"), nu("1,300"), nu("9.7s")],
          [nm("“Your CRM is lying to your forecast” · whiteboard breakdown", "31 May · 1:15pm · Contrarian open"), cp([{ label: "Reel", variant: "active" }]), nu("88,000"), nu("71,200"), nu("3,300"), nu("1,700"), nu("12.1s")],
          [nm("Carousel · 5 ops jobs to hand to an agent first", "25 May · 8:00am · Listicle promise"), cp([{ label: "Carousel", variant: "paused" }]), nu("41,000"), nu("36,800"), nu("2,100"), nu("600"), nu("—")],
          [nm("POV · watching the morning agent queue drain itself", "6 Jun · 7:05am · POV ambience"), cp([{ label: "Reel", variant: "active" }]), nu("38,500"), nu("33,100"), nu("900"), nu("740"), nu("8.2s")],
          [nm("Carousel · what an AI audit actually hands you", "18 May · 9:30am · Behind the curtain"), cp([{ label: "Carousel", variant: "paused" }]), nu("22,000"), nu("19,800"), nu("1,400"), nu("280"), nu("—")],
        ],
      },
    },
  ],
  cta: { title: "Want this for your business?", text: "Your content performance mined weekly · what worked, what to re-hash, hooks ranked." },
};

/* ============================================================
   5 · INSTANTLY + HEYREACH · OUTBOUND
   ============================================================ */
const outbound: Center = {
  id: "outbound",
  short: "Outbound",
  name: "Instantly + HeyReach · Outbound",
  sub: "From cold send to booked call, counted honestly",
  color: "#ff9d5c",
  tools: ["Instantly", "HeyReach", "LinkedIn"],
  ranges: ["7d", "14d", "30d", "90d"],
  defaultRange: "30d",
  guide: {
    tool: "the Instantly + HeyReach APIs",
    time: "~15-20 min",
    connect: "Cold email via the Instantly v2 API (official remote MCP available) plus LinkedIn via the HeyReach public API, snapshotted into Supabase and joined to your calendar/CRM for the honest Booked column.",
  },
  blocks: [
    {
      type: "kpis",
      items: [
        { icon: "send", label: "Emails Sent", value: "6,180", badge: { up: true, txt: "+6.4%" }, foot: "Weekdays only, by design", spark: true },
        { icon: "reply", label: "Real Replies", value: "104", badge: { up: true, txt: "1.7%" }, foot: "Auto-replies excluded", spark: true },
        { icon: "target", label: "Opportunities", value: "49", badge: { up: true, txt: "0.79%" }, foot: "Interested leads ↗" },
        { icon: "dollar", label: "Pipeline Value", value: "$465,500", badge: { up: true, txt: "+24%" }, foot: "From this channel ↗" },
        { icon: "shield", label: "Bounce Rate", value: "2.0%", badge: { up: true, txt: "< 3% healthy" }, foot: "Lists verified before send" },
      ],
    },
    {
      type: "row",
      ratio: "2:1",
      left: {
        kind: "area",
        icon: "trend",
        title: "Sends & replies",
        sub: "Daily · weekends pause by schedule · hover any day",
        seedKey: "out-sends",
        height: 252,
        yLabels: ["320", "213", "107", "0"],
        xLabels: ["May 12", "May 18", "May 24", "May 30", "Jun 5", "Jun 11"],
        legend: [
          { label: "sent", color: "var(--a)" },
          { label: "replies", color: "var(--copper)" },
        ],
      },
      right: {
        kind: "sections",
        icon: "shield",
        title: "Deliverability",
        sub: "Account average · 96 / 100 warmup",
        sections: [
          {
            type: "bars",
            fmt: "pct",
            max: 100,
            bars: [
              { label: "Landed in inbox", value: 94, color: GOOD },
              { label: "Landed in spam", value: 6, color: BAD },
            ],
          },
          { type: "subhead", icon: "send", title: "Sending inboxes" },
          {
            type: "table",
            head: [{ label: "Sender" }, { label: "Warmup", num: true }, { label: "Bounce", num: true }],
            rows: [
              [tx("a.reyes@brightlinehq.com"), cp([{ label: "98", variant: "active" }]), nu("0.7%")],
              [tx("amara@getbrightline.com"), cp([{ label: "97", variant: "active" }]), nu("0.9%")],
              [tx("m.okafor@brightlinehq.com"), cp([{ label: "96", variant: "active" }]), nu("1.1%")],
              [tx("mfon@brightline-app.com"), cp([{ label: "95", variant: "active" }]), nu("1.4%")],
              [tx("j.lindqvist@getbrightline.com"), cp([{ label: "93", variant: "qavg" }]), nu("2.0%")],
              [tx("johan@brightline-app.com"), cp([{ label: "89", variant: "fatigue" }]), nu("2.6%", true)],
            ],
          },
          { type: "subhead", icon: "users", title: "LinkedIn" },
          {
            type: "bars",
            fmt: "num",
            max: 640,
            bars: [
              { label: "Requests sent", value: 640, color: INTEL },
              { label: "Accepted (31%)", value: 198, color: GOOD },
              { label: "Replies (19%)", value: 87, color: COPPER },
            ],
          },
        ],
      },
    },
    {
      type: "signals",
      items: [
        { tone: "good", icon: "check", lead: "Logistics SaaS replies at 3.4%", rest: " · 2.1× the B2B median. Scale the list before the angle ages." },
        { tone: "warn", icon: "alert", lead: "Property managers AU/NZ bouncing at 2.4%", rest: " · re-verify before the next batch or the domain pays for it." },
        { tone: "info", icon: "clock", lead: "6 opportunities are awaiting first call", rest: " · oldest interested reply is 31 hours old." },
      ],
    },
    {
      type: "panel",
      panel: {
        kind: "table",
        icon: "mega",
        title: "Campaigns",
        sub: "3 live sequences · 3-step email + LinkedIn touch",
        head: [{ label: "Campaign" }, { label: "Sent", num: true }, { label: "Reply rate", num: true }, { label: "Opportunities", num: true }, { label: "Bounce", num: true }],
        rows: [
          [nm("Logistics SaaS · freight-invoice angle", "Ops + finance leaders · 3,184 verified contacts"), nu("2,840"), nu("3.4%"), nu("19"), nu("1.6%")],
          [nm("Recruitment agencies · placement-report lead", "Agency directors · 2,455 verified contacts"), nu("2,210"), nu("2.7%"), nu("14"), nu("2.1%")],
          [nm("Property managers · AU/NZ · dormant-lead angle", "Portfolio managers · 1,377 contacts · re-verify queued"), nu("1,130"), nu("2.1%"), nu("6"), nu("2.4%", true)],
        ],
      },
    },
  ],
  cta: { title: "Want this for your business?", text: "A full outbound system · list building, sequences, reply handling, this dashboard · run for you." },
};

/* ============================================================
   6 · MISSION CONTROL · CLIENT DELIVERY
   ============================================================ */
const ops: Center = {
  id: "ops",
  short: "Delivery",
  name: "Mission Control · Client Delivery",
  sub: "Six engagements, one ops room · agents doing the work",
  color: "#5eead4",
  tools: ["Mission Control"],
  guide: {
    tool: "Supabase + Inngest + the Claude API",
    time: "~45-75 min",
    connect: "Supabase (Postgres + RLS) as the source of truth, with Inngest-scheduled agents (Claude API workers) writing engagements, tasks, and an append-only activity feed that the dashboard renders.",
  },
  blocks: [
    {
      type: "kpis",
      items: [
        { icon: "grid", label: "Active Engagements", value: "6", badge: { up: true, txt: "5 verticals" }, foot: "All phases moving" },
        { icon: "check", label: "Shipped This Week", value: "14", badge: { up: true, txt: "+3 vs avg" }, foot: "Deliverables ↗", spark: true },
        { icon: "clock", label: "On-Time Rate", value: "92%", badge: { up: true, txt: "30d" }, foot: "Milestones met ↗" },
        { icon: "alert", label: "Open Items", value: "23", badge: { up: false, txt: "3 overdue" }, foot: "One blocker needs a human ↘" },
        { icon: "reply", label: "Avg Response", value: "3.1h", badge: { up: true, txt: "-40min" }, foot: "Client comms ↗" },
      ],
    },
    {
      type: "signals",
      items: [
        { tone: "warn", icon: "alert", lead: "TalentRise blocked 6 days", rest: " on ATS API access · escalation drafted, needs your approval." },
        { tone: "good", icon: "check", lead: "Processing accuracy 97.2%", rest: " on the latest 240-invoice batch · above the 95% contract threshold." },
        { tone: "info", icon: "clock", lead: "3 milestones land this week", rest: " · Fri benchmark, Mon sign-off, Wed demo. All prepared." },
      ],
    },
    {
      type: "row",
      ratio: "2:1",
      left: {
        kind: "table",
        icon: "grid",
        title: "Engagements",
        sub: "Names anonymised · progress against phase",
        head: [{ label: "Client" }, { label: "Phase" }, { label: "Progress" }, { label: "Status" }],
        rows: [
          [nm("Meridian Freight Group", "Ava Brennan · AP Manager"), tx("Phase 2 · production"), pg(82), cp([{ label: "On track", variant: "active" }])],
          [nm("Northgate Equipment Co", "Ruth Calloway · Sales Ops Lead"), tx("Phase 1 · quoting engine"), pg(56), cp([{ label: "On track", variant: "active" }])],
          [nm("Harborview Property Group", "Paula Vance · Operations Manager"), tx("Phase 0 audit"), pg(38), cp([{ label: "On track", variant: "active" }])],
          [nm("TalentRise Recruitment", "Greta Larsen · Managing Director"), tx("Matching engine · v2"), pg(71, true), cp([{ label: "At risk", variant: "fatigue" }])],
          [nm("Loopkit Software", "Elise Marchetti · COO"), tx("Churn-risk alerts"), pg(64), cp([{ label: "On track", variant: "active" }])],
          [nm("Stackbridge IT Services", "Owen McAllister · Bid Manager"), tx("RFP engine · phase 0"), pg(24), cp([{ label: "On track", variant: "active" }])],
        ],
      },
      right: {
        kind: "feed",
        icon: "zap",
        title: "This morning, run by agents",
        sub: "Every line is a Arkom role doing its job",
        rows: [
          { time: "09:41", text: "Meeting transcript processed · 4 action items assigned, recap drafted", role: "Follow-Up Coordinator" },
          { time: "09:12", text: "Portal synced · 2 deliverables published to client portal", role: "Client Portal Manager" },
          { time: "08:55", text: "INV-0259 generated and sent · $12,500, net 14", role: "Billing Manager" },
          { time: "08:30", text: "Processing batch complete · 240 invoices, 97.2% field accuracy", role: "Document Processing Engineer" },
          { time: "07:58", text: "Weekly status update drafted for 6 clients · pending approval", role: "Delivery Status Reporter" },
          { time: "07:30", text: "Knowledge base updated · 3 client context files current", role: "Node Zero" },
        ],
      },
    },
  ],
  cta: { title: "This is the actual product.", text: "Your delivery ops, running like this · agents doing the work, you approving it." },
};

export const CENTERS: Center[] = [meta, pipeline, finance, content, outbound, ops];

import type { ComponentType } from "react";
import { Briefcase, Sparkles, TrendingUp } from "lucide-react";

/** Minimal shape shared by every lucide icon we render in the hub. */
export type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

/** Arkom taxonomy — each department maps to an accent token. */
export type Department =
  | "Sales"
  | "Deals"
  | "Marketing"
  | "Operations"
  | "Intelligence"
  | "Customer"
  | "Back office";

export const DEPARTMENT_COLOR: Record<Department, string> = {
  Sales: "var(--st-sales)",
  Deals: "var(--st-deals)",
  Marketing: "var(--st-marketing)",
  Operations: "var(--st-operations)",
  Intelligence: "var(--st-intelligence)",
  Customer: "var(--st-customer)",
  "Back office": "var(--st-back-office)",
};

export interface ModuleItem {
  label: string;
  title: string;
  description: string;
  lessons: string;
  href: string;
  /** in-progress lessons — shows "done/total lessons" + a bar (member state). */
  progress?: { done: number; total: number };
}

export const MODULES: ModuleItem[] = [
  {
    label: "Module 01",
    title: "Start Here",
    description:
      "Get the mindset and the map before you open a terminal · what Arkom is and how to think about building AI that pays.",
    lessons: "8 lessons",
    href: "/modules/start-here",
    progress: { done: 5, total: 8 },
  },
  {
    label: "Module 02",
    title: "Claude Code Foundations",
    description:
      "Go from no Claude Code to installed, configured, and connected to your stack.",
    lessons: "5 lessons",
    href: "/modules/foundations",
  },
  {
    label: "Module 03",
    title: "Build Your Brain",
    description:
      "Build the second brain every Arkom skill reads from · in Notion and Obsidian.",
    lessons: "5 lessons",
    href: "/modules/second-brain",
  },
];

/** The skill landing next — powers the "NEXT DROP" banner (member state). */
export const NEXT_DROP: { title: string; department: Department; when: string } = {
  title: "SEO Engineer",
  department: "Marketing",
  when: "Wednesday",
};

export interface DropItem {
  department: Department;
  time: string;
  title: string;
  description: string;
  installs: string;
  icon: IconType;
  href: string;
}

export const DROPS: DropItem[] = [
  {
    department: "Sales",
    time: "3 days ago",
    title: "ICP Strategist",
    description:
      "Turns your win/loss history into ideal-customer profiles your agents can actually act on.",
    installs: "2 installs",
    icon: TrendingUp,
    href: "/drops/icp-strategist",
  },
  {
    department: "Operations",
    time: "5 days ago",
    title: "Brain Sync",
    description:
      "The bridge that makes every skill read your Notion or Obsidian Cortex · edit your brain, run sync, and your skills quote the current truth.",
    installs: "3 installs",
    icon: Sparkles,
    href: "/drops/brain-sync",
  },
  {
    department: "Deals",
    time: "6 days ago",
    title: "Inbound Response Manager",
    description:
      "Every form fill, email and DM answered in minutes, qualified and routed while it's hot.",
    installs: "1 install",
    icon: Briefcase,
    href: "/drops/inbound-response-manager",
  },
  {
    department: "Operations",
    time: "10 days ago",
    title: "Meeting Intelligence",
    description:
      "Every call captured, summarized, and turned into action items · nothing evaporates.",
    installs: "5 installs",
    icon: Sparkles,
    href: "/drops/meeting-intelligence",
  },
];

export interface StarterSkill {
  name: string;
  department: Department;
  color: string;
}

/** Starter skills surfaced in the "Get started" onboarding card. */
export const STARTER_SKILLS: StarterSkill[] = [
  {
    name: "Carousel Designer",
    department: "Marketing",
    color: DEPARTMENT_COLOR.Marketing,
  },
  {
    name: "Cold Email Copywriter",
    department: "Sales",
    color: DEPARTMENT_COLOR.Sales,
  },
  {
    name: "Knowledge Base",
    department: "Operations",
    color: DEPARTMENT_COLOR.Operations,
  },
];

export interface RankItem {
  rank: number;
  name: string;
  installs: string;
}

export const MOST_INSTALLED: RankItem[] = [
  { rank: 1, name: "Meeting Intelligence Engineer", installs: "5 installs" },
  { rank: 2, name: "Lead Sourcing Manager", installs: "4 installs" },
  { rank: 3, name: "Brain Sync", installs: "3 installs" },
  { rank: 4, name: "Content Performance Analyst", installs: "2 installs" },
  { rank: 5, name: "Cold Email Copywriter", installs: "2 installs" },
];

export interface FeaturedDropData {
  department: Department;
  eyebrow: string;
  title: string;
  description: string;
  meta: string;
  cta: string;
}

export const FEATURED_DROP: FeaturedDropData = {
  department: "Sales",
  eyebrow: "Featured this week",
  title: "Lead Sourcing Manager",
  description:
    "Describe your ICP and it builds the targeted company + people list, ready to send.",
  meta: "Added 9 days ago · 4 installs",
  cta: "Install skill",
};

export interface BuildLog {
  author: string;
  title: string;
  meta: string;
  excerpt: string;
}

export const BUILD_LOG: BuildLog = {
  author: "Ahmed",
  title:
    "I built a Remotion reel agent this week · here's the whole thing",
  meta: "13 days ago · 4 min read",
  excerpt:
    "The exact skill I use to turn one idea into a branded video: the prompt, the design tokens it runs on, and how it plugs into node zero. It's in Drops now and it's been quietly replacing my video editor.",
};

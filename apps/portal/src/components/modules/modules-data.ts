import type { ComponentType } from "react";
import { Compass, Terminal, Brain } from "lucide-react";

/** Minimal shape shared by every lucide icon we render on the modules page. */
export type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

/**
 * A single live module in the Arkom build path.
 * `pathLabel` is the short name used in the top stepper; `title` is the full
 * card heading. `outcome` is the "what you walk away with" sentence.
 */
export interface ModuleEntry {
  num: string;
  pathLabel: string;
  title: string;
  description: string;
  lessons: string;
  outcome: string;
  href: string;
  icon: IconType;
  /** in-progress lessons — shows "done/total lessons" + a bar (member state). */
  progress?: { done: number; total: number };
}

export const MODULES_INTRO =
  "The build path, in order. Get Claude Code running, build the brain everything reads from, then hire your AI employees from the map and stand up your command centers. 3 modules live, 18 lessons.";

export const MODULE_ENTRIES: ModuleEntry[] = [
  {
    num: "01",
    pathLabel: "Start Here",
    title: "Start Here",
    description:
      "Get the mindset and the map before you open a terminal · what Arkom is and how to think about building AI that pays.",
    lessons: "8 lessons",
    outcome:
      "The map, the dashboards, and the brain make sense, you can spot AI opportunities worth building, and you have a 7-day plan to get your first AI employee and command center live.",
    href: "/modules/start-here",
    icon: Compass,
    progress: { done: 5, total: 8 },
  },
  {
    num: "02",
    pathLabel: "Foundations",
    title: "Claude Code Foundations",
    description:
      "Go from no Claude Code to installed, configured, and connected to your stack.",
    lessons: "5 lessons",
    outcome:
      "Claude Code running in VS Code, a global and project CLAUDE.md set up, a working mental model, an understanding of how skills plug in, and your core MCP stack connected.",
    href: "/modules/foundations",
    icon: Terminal,
  },
  {
    num: "03",
    pathLabel: "Second Brain",
    title: "Build Your Brain",
    description:
      "Build the second brain every Arkom skill reads from · in Notion and Obsidian.",
    lessons: "5 lessons",
    outcome:
      "Your company's second brain, live in Notion and Obsidian, connected to Claude and fed by an automatic capture workflow, so every skill reads real context instead of a cold start.",
    href: "/modules/second-brain",
    icon: Brain,
  },
];

/**
 * PT module-name overlays (Pkg10 · N7 R2). In PT the module NAME translates
 * didactically on every surface (cards, stepper, detail title, next/prev),
 * consistent with the PT skill-name policy. Product taxonomy stays EN inside
 * the string ("Claude Code"). EN renders verbatim.
 */
export const MODULE_NAME_PT: Record<string, string> = {
  "Start Here": "Comece aqui",
  "Claude Code Foundations": "Fundamentos do Claude Code",
  "Build Your Brain": "Construa seu cérebro",
};

/** Short stepper labels (pathLabel), translated for PT. */
export const MODULE_PATHLABEL_PT: Record<string, string> = {
  "Start Here": "Comece aqui",
  Foundations: "Fundamentos",
  "Second Brain": "Segundo Cérebro",
};

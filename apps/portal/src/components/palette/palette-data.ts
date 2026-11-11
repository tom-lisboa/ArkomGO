/**
 * Command-palette corpus (Pkg15 · Feature A). One flat, searchable index built
 * from the real app data so ⌘K jumps to anything: the 5 nav destinations, every
 * skill (from the map taxonomy), the 7 departments, the 6 command centers, and
 * every module lesson.
 *
 * Display is locale-aware: skill names resolve PT via SKILL_NAME_PT, department
 * names via deptNamePt, lesson titles via the bilingual pairs in content.ts.
 * Product/integration names (dashboard titles like "HubSpot · Sales Pipeline")
 * stay EN — same policy as the rest of the app.
 */
import { DEPARTMENTS } from "@/components/map/skilltree-data";
import { CENTERS } from "@/components/dash/dash-data";
import { MODULE_DETAIL } from "@/components/modules/content";
import { SKILL_NAME_PT } from "@/lib/content-pt";
import { deptNamePt } from "@/components/hub/skill-names-pt";
import type { Locale } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/en";

export type PaletteKind = "nav" | "skill" | "department" | "dashboard" | "lesson";

export interface PaletteItem {
  id: string;
  kind: PaletteKind;
  title: string;
  sub: string;
  tag: string;
  href: string;
}

/** "icp-profiler" → "Icp Profiler" — the EN display fallback for a skill slug. */
function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The 5 default rows shown when the query is empty (nav destinations). */
export function buildNavRows(t: Dict): PaletteItem[] {
  const n = t.palette.nav;
  const go = t.palette.tag.go;
  return [
    { id: "nav-home", kind: "nav", title: n.homeTitle, sub: n.homeSub, tag: go, href: "/map" },
    { id: "nav-hub", kind: "nav", title: n.hubTitle, sub: n.hubSub, tag: go, href: "/hub" },
    { id: "nav-modules", kind: "nav", title: n.modulesTitle, sub: n.modulesSub, tag: go, href: "/modules" },
    { id: "nav-tree", kind: "nav", title: n.treeTitle, sub: n.treeSub, tag: go, href: "/tree" },
    { id: "nav-brain", kind: "nav", title: n.brainTitle, sub: n.brainSub, tag: go, href: "/brain" },
  ];
}

/**
 * The searchable content corpus (skills + departments + dashboards + lessons).
 * Rebuilt only when the locale changes.
 */
export function buildSearchCorpus(locale: Locale, t: Dict): PaletteItem[] {
  const items: PaletteItem[] = [];
  const pt = locale === "pt";

  // Skills — one row per unique skill slug in the map taxonomy, first job wins
  // for the department + description shown in the subtitle.
  const seen = new Set<string>();
  for (const dept of DEPARTMENTS) {
    const deptLabel = deptNamePt(dept.name, locale);
    for (const fn of dept.functions) {
      for (const job of fn.jobs) {
        for (const slug of job.skills) {
          if (seen.has(slug)) continue;
          seen.add(slug);
          const enTitle = humanize(slug);
          const title = pt ? SKILL_NAME_PT[slug] ?? enTitle : enTitle;
          items.push({
            id: `skill-${slug}`,
            kind: "skill",
            title,
            sub: `${deptLabel} · ${job.desc}`,
            tag: t.palette.tag.map,
            href: "/map",
          });
        }
      }
    }
  }

  // Departments (7)
  for (const dept of DEPARTMENTS) {
    items.push({
      id: `dept-${dept.id}`,
      kind: "department",
      title: deptNamePt(dept.name, locale),
      sub: t.palette.sub.department,
      tag: t.palette.tag.map,
      href: "/map",
    });
  }

  // Command centers (dashboards) — names stay EN (product/integration taxonomy)
  for (const center of CENTERS) {
    items.push({
      id: `dash-${center.id}`,
      kind: "dashboard",
      title: center.name,
      sub: center.sub,
      tag: t.palette.tag.dashboard,
      href: "/dash",
    });
  }

  // Lessons (18 across the 3 modules)
  for (const mod of Object.values(MODULE_DETAIL)) {
    mod.lessons.forEach((lesson, i) => {
      items.push({
        id: `lesson-${mod.slug}-${i}`,
        kind: "lesson",
        title: pt ? lesson.title.pt : lesson.title.en,
        sub: `${t.palette.sub.lesson} · ${mod.title}`,
        tag: t.palette.tag.lesson,
        href: `/modules/${mod.slug}`,
      });
    });
  }

  return items;
}

/**
 * Flat ranked search: title matches beat subtitle matches, a title that STARTS
 * with the query beats a title that merely contains it. Capped so the list stays
 * navigable on very common terms.
 */
export function searchCorpus(corpus: PaletteItem[], rawQuery: string): PaletteItem[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const scored: { item: PaletteItem; score: number }[] = [];
  for (const item of corpus) {
    const title = item.title.toLowerCase();
    let score = 0;
    if (title.startsWith(q)) score = 3;
    else if (title.includes(q)) score = 2;
    else if (item.sub.toLowerCase().includes(q)) score = 1;
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  return scored.slice(0, 40).map((s) => s.item);
}

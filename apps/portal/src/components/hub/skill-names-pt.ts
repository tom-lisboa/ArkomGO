/**
 * Hub/tree PT overlays for the generalist-PT sweep (Pkg11 · founder directive).
 *
 * The founder's rule went generalist: anything that can be clear PT-BR becomes PT
 * (audience = business owners who need to grasp what each skill does). EN stays only
 * for the hard-technical exceptions (CLAUDE.md, SKILL.md, npx/curl, "Back Office",
 * acronyms ICP/SEO/CRM/CPL, integration names, "Mac/Linux"/"Windows").
 *
 * Why here and not content-pt.ts: the font-builder's SKILL_NAME_PT lives in
 * content-pt.ts (concurrent edits) and is keyed by MAP SLUG, so it does not resolve
 * the hub's display-name skills. These hub-specific names are display-name-keyed and
 * live here. If the font-builder later covers a name, dedupe toward theirs.
 *
 * Didactic, not literal. Recognized jargon kept EN (Inbound, Lead, Cold Email,
 * Apollo, Copywriter).
 *
 * FM1: the FindMorePanel catalog items arrive as MAP SKILL SLUGS (job.skills are
 * slugs), so skillNamePt also consults the font-builder's slug-keyed SKILL_NAME_PT
 * (read-only import — consuming ≠ editing). Coverage measured 296/296 (100%).
 */
import { SKILL_NAME_PT } from "@/lib/content-pt";

export const HUB_SKILL_NAME_PT: Record<string, string> = {
  "SDR Suite · Bia": "SDR Suite · Bia",
  "Multi-Agent Customer Service": "Atendimento Multi-Agentes",
  "FinanceAI": "FinanceAI",
  "Autonomous CMO Agent": "Agente Autônomo CMO",
  "Social Media Automation": "Mega Automação de Redes Sociais",
  "Bilhon Ads": "Bilhon Ads",
  "ICP Strategist": "Estrategista de ICP",
  "Brain Sync": "Sincronizador do Cérebro",
  "Inbound Response Manager": "Gerente de Respostas Inbound",
  "Meeting Intelligence": "Inteligência de Reuniões",
  "Meeting Intelligence Engineer": "Engenheiro de Inteligência de Reuniões",
  "Lead Sourcing Manager": "Gerente de Prospecção de Leads",
  "Content Performance Analyst": "Analista de Performance de Conteúdo",
  "Cold Email Copywriter": "Copywriter de Cold Email",
  "Carousel Designer": "Designer de Carrossel",
  "Knowledge Base": "Base de Conhecimento",
  "SEO Engineer": "Engenheiro de SEO",
};

/**
 * Department display names. "Back office" stays EN (founder exception). NOTE: the map
 * (out of this domain) still renders EN dept names — full app consistency needs the
 * same overlay consumed there; flagged for coordination.
 */
export const DEPT_NAME_PT: Record<string, string> = {
  Sales: "Vendas",
  Deals: "Negócios",
  Marketing: "Marketing",
  Operations: "Operações",
  Intelligence: "Inteligência",
  Customer: "Clientes",
};

/** Matches the map's slug() so a display name can also hit the slug-keyed SKILL_NAME_PT. */
function slugSkill(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Skill name → PT. Resolves map skills (name = slug) via SKILL_NAME_PT, hub drops
 * (name = display) via the hub overlay, and display→slug as a final bridge. Unknown
 * names fall through to EN.
 */
export function skillNamePt(name: string, locale: string): string {
  if (locale !== "pt") return name;
  return (
    SKILL_NAME_PT[name] ??
    HUB_SKILL_NAME_PT[name] ??
    SKILL_NAME_PT[slugSkill(name)] ??
    name
  );
}

/** Department display-name → PT. "Back office" and unknowns fall through to EN. */
export function deptNamePt(dept: string, locale: string): string {
  return locale === "pt" ? DEPT_NAME_PT[dept] ?? dept : dept;
}

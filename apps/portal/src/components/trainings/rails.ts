// components/trainings/rails.ts — prateleiras ("rails") do catálogo como CONFIG.
//
// Por que existe: as duas rails da Universidade IA estavam hardcoded em
// `trainings-body.tsx` ("Top {n} cursos no Brasil" + "Em breve"). Com 7+ cursos
// reais no ar, a composição precisa ser editável no /admin, sem deploy.
// A configuração vive em `course_rails` / `course_rail_slots` (migration 0013)
// e só passa a valer com a flag `course_rails_enabled` LIGADA.
//
// Contrato de degradação (mesma doutrina do resto da branch):
//   · flag desligada, tabela ausente (42P01), erro de banco, nenhuma rail
//     habilitada ou nenhuma rail com curso ⇒ devolve `null`, e o
//     `trainings-body` renderiza o layout hardcoded de sempre. Configuração
//     ruim NUNCA deixa o aluno sem catálogo.
//
// Server-only (usa getSql/feature-flags). O client importa daqui apenas TIPOS,
// com `import type` — que é apagado na compilação.

import { getSql } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { Course } from "./content";

/** De onde saem os cursos de uma prateleira. Espelha o CHECK da 0013. */
export const COURSE_RAIL_MODES = ["manual", "todos", "top", "em_breve"] as const;
export type CourseRailMode = (typeof COURSE_RAIL_MODES)[number];

/** Formato do card. `rank` = TopNineCard (dígito gigante); `poster` = PortraitCard. */
export const COURSE_RAIL_CARD_STYLES = ["rank", "poster"] as const;
export type CourseRailCardStyle = (typeof COURSE_RAIL_CARD_STYLES)[number];

/** Ícones oferecidos no /admin (mapeados para lucide em `trainings-body`). */
export const COURSE_RAIL_ICONS = [
  "trophy",
  "clock",
  "graduation",
  "sparkles",
  "flame",
  "star",
  "layers",
  "bookmark",
] as const;
export type CourseRailIcon = (typeof COURSE_RAIL_ICONS)[number];

const DEFAULT_ICON: CourseRailIcon = "graduation";

/** Ícone válido, ou o padrão — chave desconhecida no banco não quebra a página. */
export function normalizeRailIcon(icon: string | null | undefined): CourseRailIcon {
  return (COURSE_RAIL_ICONS as readonly string[]).includes(icon ?? "")
    ? (icon as CourseRailIcon)
    : DEFAULT_ICON;
}

/** Linha de `course_rails`, como vem do banco. */
export type CourseRailRow = {
  id: number;
  slug: string;
  title: string;
  mode: CourseRailMode;
  card_style: CourseRailCardStyle;
  icon: string;
  item_limit: number | null;
  clickable: boolean;
  sort_order: number;
  enabled: boolean;
};

/** Curso do catálogo na forma mínima que a resolução precisa. */
export type RailCatalogCourse = {
  /** id de `courses` (não é o slug de rota). */
  id: number;
  /** publicado, mas ainda sem nenhuma aula publicada. */
  comingSoon: boolean;
  /** Aulas concluídas pelos alunos (modo `top` ranqueia por MAIS ASSISTIDOS —
   *  decisão do dono 2026-07-25; supersede o "top manual" de D8). Ausente = 0. */
  watchScore?: number;
};

/** Uma prateleira já resolvida, pronta para o render do aluno. */
export type CourseRailView = {
  slug: string;
  /** título já com o `{n}` trocado pela quantidade exibida. */
  title: string;
  icon: CourseRailIcon;
  cardStyle: CourseRailCardStyle;
  /** Modo da prateleira — `todos` renderiza como GRADE na tela (dono,
   *  2026-07-25); os demais como trilho horizontal. */
  mode: CourseRailMode;
  /** false = os cards não navegam (regra do plano para "Em breve"). */
  clickable: boolean;
  courses: Course[];
};

/** Troca o marcador `{n}` pela quantidade EFETIVA de cursos da prateleira. */
export function railTitle(title: string, count: number): string {
  return title.replaceAll("{n}", String(count));
}

/**
 * Resolve QUAIS cursos entram na prateleira, na ordem, já com o teto aplicado.
 * Pura: o /trainings usa para montar cards, o /admin usa para o preview da
 * composição efetiva — as duas telas nunca divergem.
 *
 * `catalog` já vem na ordem do catálogo (`courses.sort_order, id`) e só com
 * cursos publicados; `manualSlots` mapeia rail_id → ids de curso na ordem das
 * posições. Curso escolhido à mão que saiu do catálogo (despublicado/excluído)
 * simplesmente não aparece.
 */
export function resolveRailCourseIds(
  rail: Pick<CourseRailRow, "id" | "mode" | "item_limit">,
  catalog: RailCatalogCourse[],
  manualSlots: Map<number, number[]>,
): number[] {
  let ids: number[];
  switch (rail.mode) {
    case "manual": {
      const published = new Set(catalog.map((course) => course.id));
      ids = (manualSlots.get(rail.id) ?? []).filter((id) => published.has(id));
      break;
    }
    case "top": {
      // Mais assistidos primeiro (aulas concluídas por curso); empate mantém a
      // ordem do catálogo — sort estável sobre uma cópia indexada.
      ids = catalog
        .filter((course) => !course.comingSoon)
        .map((course, index) => ({ course, index }))
        .sort(
          (a, b) =>
            (b.course.watchScore ?? 0) - (a.course.watchScore ?? 0) ||
            a.index - b.index,
        )
        .map((entry) => entry.course.id);
      break;
    }
    case "em_breve":
      ids = catalog.filter((course) => course.comingSoon).map((course) => course.id);
      break;
    case "todos":
    default:
      ids = catalog.map((course) => course.id);
      break;
  }
  const limit = rail.item_limit;
  return limit !== null && limit > 0 ? ids.slice(0, limit) : ids;
}

/**
 * Aulas concluídas por curso — o "assistidos" que ranqueia o modo `top`.
 * Falha de leitura ⇒ mapa vazio (todo mundo com 0, ordem do catálogo vale):
 * ranking indisponível NUNCA derruba a página.
 */
export async function loadCourseWatchScores(): Promise<Map<number, number>> {
  const sql = getSql();
  try {
    const rows = await sql<{ course_id: number; score: number }[]>`
      SELECT l.course_id, COUNT(*)::int AS score
        FROM lesson_progress p
        JOIN lessons l ON l.id = p.lesson_id
       WHERE p.completed = 1
       GROUP BY l.course_id
    `;
    return new Map(rows.map((row) => [row.course_id, row.score]));
  } catch (error) {
    console.error("[arkom] Falha ao ler assistidos por curso (top segue a ordem do catálogo):", error);
    return new Map();
  }
}

/** Config completa lida do banco (ou `null` se não houver como ler). */
type RailConfig = { rails: CourseRailRow[]; slots: Map<number, number[]> };

async function loadRailConfig(): Promise<RailConfig | null> {
  const sql = getSql();
  try {
    // Sem prefixo de schema: o `search_path` do pool resolve (app_arkom em dev
    // sem a 0013 → 42P01 → degrada para o layout hardcoded).
    const rails = await sql<CourseRailRow[]>`
      SELECT id, slug, title, mode, card_style, icon, item_limit, clickable,
             sort_order, enabled
        FROM course_rails
       WHERE enabled = true
       ORDER BY sort_order, id
    `;
    if (rails.length === 0) return { rails: [], slots: new Map() };

    const slotRows = await sql<{ rail_id: number; course_id: number }[]>`
      SELECT rail_id, course_id
        FROM course_rail_slots
       ORDER BY rail_id, sort_order, id
    `;
    const slots = new Map<number, number[]>();
    for (const row of slotRows) {
      const list = slots.get(row.rail_id) ?? [];
      list.push(row.course_id);
      slots.set(row.rail_id, list);
    }
    return { rails, slots };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      console.warn(
        "[arkom] course_rails ausente (migration 0013 não aplicada) — /trainings segue com as rails hardcoded.",
      );
    } else {
      console.error("[arkom] Falha ao ler course_rails (fallback: rails hardcoded):", error);
    }
    return null;
  }
}

/**
 * Prateleiras configuradas, prontas para renderizar — ou `null` quando o
 * chamador deve manter o layout hardcoded (flag desligada, banco sem a 0013,
 * erro de leitura, ou configuração que não produziu nenhum curso).
 *
 * `catalog` = o catálogo já mapeado para cards, na ordem do banco.
 */
export async function loadCourseRailViews(
  catalog: { id: number; card: Course }[],
): Promise<CourseRailView[] | null> {
  if (!(await isFeatureEnabled("course_rails_enabled"))) return null;

  const config = await loadRailConfig();
  if (!config || config.rails.length === 0) return null;

  const watchScores = await loadCourseWatchScores();
  const cardById = new Map(catalog.map((entry) => [entry.id, entry.card]));
  const minimal: RailCatalogCourse[] = catalog.map((entry) => ({
    id: entry.id,
    comingSoon: entry.card.comingSoon === true,
    watchScore: watchScores.get(entry.id) ?? 0,
  }));

  const views: CourseRailView[] = [];
  for (const rail of config.rails) {
    const ids = resolveRailCourseIds(rail, minimal, config.slots);
    const courses = ids
      .map((id) => cardById.get(id))
      .filter((card): card is Course => card !== undefined);
    // Prateleira vazia não renderiza — mesmo comportamento do layout hardcoded
    // (`cards.length > 0 ? <CourseRail/> : null`).
    if (courses.length === 0) continue;
    views.push({
      slug: rail.slug,
      title: railTitle(rail.title, courses.length),
      icon: normalizeRailIcon(rail.icon),
      cardStyle: rail.card_style === "rank" ? "rank" : "poster",
      mode: rail.mode,
      clickable: rail.clickable !== false,
      courses,
    });
  }

  // Nenhuma prateleira sobrou: cair para o hardcoded em vez de entregar uma
  // página de catálogo em branco.
  return views.length > 0 ? views : null;
}
